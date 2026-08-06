package handlers

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

// uploadsDir is where patient record files are stored on disk.
const uploadsDir = "uploads"

const maxUploadSize = 25 << 20 // 25 MB

var validRecordTypes = map[string]bool{
	"xray":    true,
	"allergy": true,
	"scan3d":  true,
}

var imageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true,
}

var model3dExts = map[string]bool{
	".stl": true, ".obj": true, ".glb": true, ".gltf": true,
}

func allowedExt(recordType, ext string) bool {
	ext = strings.ToLower(ext)
	if imageExts[ext] {
		return true
	}
	if recordType == "scan3d" && model3dExts[ext] {
		return true
	}
	return false
}

// ListPatientRecords returns a patient's records, optionally filtered by type.
func (h *Handlers) ListPatientRecords(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	patientID, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), patientID); err != nil {
		httpx.Fail(w, err)
		return
	}
	var typeArg pgtype.Text
	if t := r.URL.Query().Get("type"); t != "" {
		typeArg = pgtype.Text{String: t, Valid: true}
	}
	rows, err := h.q.ListPatientRecords(r.Context(), sqlc.ListPatientRecordsParams{
		PatientID:      patientID,
		ViewerClinicID: clinicID,
		Type:           typeArg,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	out := make([]patientRecordDTO, 0, len(rows))
	for _, rec := range rows {
		out = append(out, toPatientRecordDTO(rec))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// CreatePatientRecord accepts a multipart form with fields: type (required),
// title, note, and an optional file.
func (h *Handlers) CreatePatientRecord(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	patientID, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), patientID); err != nil {
		httpx.Fail(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "файл слишком большой или форма некорректна (максимум 25 МБ)"))
		return
	}

	recordType := r.FormValue("type")
	if !validRecordTypes[recordType] {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимый тип записи"))
		return
	}
	title := r.FormValue("title")
	note := r.FormValue("note")

	var storedPath, storedName string
	file, header, ferr := r.FormFile("file")
	if ferr == nil {
		defer file.Close()
		ext := filepath.Ext(header.Filename)
		if !allowedExt(recordType, ext) {
			httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "недопустимый тип файла"))
			return
		}
		storedPath, storedName, err = saveUploadedFile(patientID, file, header)
		if err != nil {
			httpx.Fail(w, err)
			return
		}
	} else if !errors.Is(ferr, http.ErrMissingFile) {
		httpx.Fail(w, httpx.NewError(http.StatusBadRequest, "не удалось прочитать файл"))
		return
	}

	userID, _ := middleware.UserID(r.Context())
	rec, err := h.q.CreatePatientRecord(r.Context(), sqlc.CreatePatientRecordParams{
		ClinicID:  clinicID,
		PatientID: patientID,
		Type:      recordType,
		Title:     pgtype.Text{String: title, Valid: true},
		Note:      pgtype.Text{String: note, Valid: true},
		FilePath:  pgtype.Text{String: storedPath, Valid: storedPath != ""},
		FileName:  pgtype.Text{String: storedName, Valid: storedName != ""},
		CreatedBy: pgtype.Int8{Int64: userID, Valid: userID > 0},
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}

	// Re-fetch through the list query so the response includes created_by_name.
	rows, err := h.q.ListPatientRecords(r.Context(), sqlc.ListPatientRecordsParams{PatientID: patientID, ViewerClinicID: clinicID})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	for _, row := range rows {
		if row.ID == rec.ID {
			httpx.JSON(w, http.StatusCreated, toPatientRecordDTO(row))
			return
		}
	}
	httpx.JSON(w, http.StatusCreated, map[string]int64{"id": rec.ID})
}

// DeletePatientRecord removes a record and its file (if any).
func (h *Handlers) DeletePatientRecord(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	recordID, err := idParamFromString(chi.URLParam(r, "recordId"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rec, err := h.q.GetPatientRecord(r.Context(), recordID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "запись не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), rec.PatientID); err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.q.DeletePatientRecord(r.Context(), sqlc.DeletePatientRecordParams{ID: recordID, ClinicID: clinicID}); err != nil {
		httpx.Fail(w, err)
		return
	}
	if rec.FilePath.Valid && rec.FilePath.String != "" {
		_ = os.Remove(rec.FilePath.String)
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetPatientRecordFile streams the stored file for a record. Медкарта общая для
// платформы, поэтому файл доступен любой клинике — доступ к самому пациенту
// проверяется ниже (checkPatientAccess).
func (h *Handlers) GetPatientRecordFile(w http.ResponseWriter, r *http.Request) {
	if _, err := h.clinicID(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	recordID, err := idParamFromString(chi.URLParam(r, "recordId"))
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	rec, err := h.q.GetPatientRecord(r.Context(), recordID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, httpx.NewError(http.StatusNotFound, "запись не найдена"))
			return
		}
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), rec.PatientID); err != nil {
		httpx.Fail(w, err)
		return
	}
	if !rec.FilePath.Valid || rec.FilePath.String == "" {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "у записи нет файла"))
		return
	}
	name := "file"
	if rec.FileName.Valid {
		name = rec.FileName.String
	}
	w.Header().Set("Content-Disposition", `inline; filename="`+name+`"`)
	http.ServeFile(w, r, rec.FilePath.String)
}

// saveUploadedFile writes an uploaded file to disk under uploads/{patientID}/
// with a timestamp-prefixed name to avoid collisions.
func saveUploadedFile(patientID int64, file multipart.File, header *multipart.FileHeader) (path, name string, err error) {
	dir := filepath.Join(uploadsDir, strconv.FormatInt(patientID, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	safeName := filepath.Base(header.Filename)
	storedName := strconv.FormatInt(time.Now().UnixNano(), 10) + "_" + safeName
	fullPath := filepath.Join(dir, storedName)

	dst, err := os.Create(fullPath)
	if err != nil {
		return "", "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		return "", "", err
	}
	return fullPath, safeName, nil
}
