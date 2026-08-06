package handlers

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"temart/internal/db/sqlc"
	"temart/internal/httpx"
	"temart/internal/middleware"
)

// ---------------------------------------------------------------------------
// Аватарки пациентов и врачей.
//
// Хранятся рядом со снимками, в uploads/avatars/<kind>/<id>/. При замене старый
// файл удаляется — иначе каталог со временем зарастёт мусором.
// ---------------------------------------------------------------------------

const avatarsDir = "avatars"

// maxAvatarSize намеренно мал: это портрет в списке, а не снимок.
const maxAvatarSize = 5 << 20 // 5 MB

// avatarURL builds the URL the frontend uses to fetch an avatar. The stored file
// name goes into the query so a new upload busts the browser cache.
func avatarURL(kind string, id int64, storedPath pgtype.Text) *string {
	if !storedPath.Valid || storedPath.String == "" {
		return nil
	}
	u := "/api/" + kind + "/" + itoa(id) + "/avatar?v=" + filepath.Base(storedPath.String)
	return &u
}

// saveAvatar reads the "file" form field, stores it and returns its path.
func saveAvatar(r *http.Request, w http.ResponseWriter, kind string, id int64) (string, error) {
	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarSize)
	if err := r.ParseMultipartForm(maxAvatarSize); err != nil {
		return "", httpx.NewError(http.StatusBadRequest, "файл слишком большой или форма некорректна (максимум 5 МБ)")
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return "", httpx.NewError(http.StatusBadRequest, "файл не выбран")
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !imageExts[ext] {
		return "", httpx.NewError(http.StatusBadRequest, "аватарка должна быть изображением (jpg, png, webp, gif)")
	}

	dir := filepath.Join(uploadsDir, avatarsDir, kind, strconv.FormatInt(id, 10))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	// Имя из времени загрузки: оно же служит версией для сброса кеша браузера.
	name := strconv.FormatInt(time.Now().UnixNano(), 10) + ext
	fullPath := filepath.Join(dir, name)

	dst, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(fullPath)
		return "", err
	}
	return fullPath, nil
}

// removeAvatarFile deletes the previous avatar, ignoring a missing file.
func removeAvatarFile(p pgtype.Text) {
	if p.Valid && p.String != "" {
		_ = os.Remove(p.String)
	}
}

// serveAvatar streams a stored avatar file.
func serveAvatar(w http.ResponseWriter, r *http.Request, p pgtype.Text) {
	if !p.Valid || p.String == "" {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "аватарка не загружена"))
		return
	}
	f, err := os.Open(p.String)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "файл не найден"))
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	// Имя файла уникально при каждой загрузке, поэтому кешировать можно надолго.
	w.Header().Set("Cache-Control", "private, max-age=86400")
	http.ServeContent(w, r, filepath.Base(p.String), info.ModTime(), f)
}

// --- Пациенты ---------------------------------------------------------------

// UploadPatientAvatar stores a new avatar for a patient.
func (h *Handlers) UploadPatientAvatar(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	before, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	path, err := saveAvatar(r, w, "patients", id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.UpdatePatientAvatar(r.Context(), sqlc.UpdatePatientAvatarParams{
		ID:         id,
		AvatarPath: pgtype.Text{String: path, Valid: true},
	})
	if err != nil {
		os.Remove(path)
		httpx.Fail(w, err)
		return
	}
	removeAvatarFile(before.AvatarPath)
	dto := toPatientDTO(p)
	dto.IsOwn = p.ClinicID == clinicID
	httpx.JSON(w, http.StatusOK, dto)
}

// DeletePatientAvatar removes the avatar.
func (h *Handlers) DeletePatientAvatar(w http.ResponseWriter, r *http.Request) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	before, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.UpdatePatientAvatar(r.Context(), sqlc.UpdatePatientAvatarParams{ID: id})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	removeAvatarFile(before.AvatarPath)
	dto := toPatientDTO(p)
	dto.IsOwn = p.ClinicID == clinicID
	httpx.JSON(w, http.StatusOK, dto)
}

// GetPatientAvatar streams the patient's avatar.
func (h *Handlers) GetPatientAvatar(w http.ResponseWriter, r *http.Request) {
	if _, err := h.clinicID(r.Context()); err != nil {
		httpx.Fail(w, err)
		return
	}
	id, err := idParam(r)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	if err := h.checkPatientAccess(r.Context(), id); err != nil {
		httpx.Fail(w, err)
		return
	}
	p, err := h.q.GetPatient(r.Context(), id)
	if err != nil {
		httpx.Fail(w, httpx.NewError(http.StatusNotFound, "пациент не найден"))
		return
	}
	serveAvatar(w, r, p.AvatarPath)
}

// --- Врачи ------------------------------------------------------------------

// doctorAvatarTarget resolves the {id} path parameter to a doctor of the
// caller's clinic and checks that the caller may change their avatar: a manager
// may change anyone's, a doctor only their own.
func (h *Handlers) doctorAvatarTarget(r *http.Request, mutating bool) (sqlc.Doctor, int64, error) {
	clinicID, err := h.clinicID(r.Context())
	if err != nil {
		return sqlc.Doctor{}, 0, err
	}
	id, err := idParam(r)
	if err != nil {
		return sqlc.Doctor{}, 0, err
	}
	doctor, err := h.q.GetDoctor(r.Context(), sqlc.GetDoctorParams{ID: id, ClinicID: clinicID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Doctor{}, 0, httpx.NewError(http.StatusNotFound, "врач не найден")
		}
		return sqlc.Doctor{}, 0, err
	}
	if !mutating {
		return doctor, clinicID, nil
	}
	if middleware.Role(r.Context()) == "doctor" {
		userID, _ := middleware.UserID(r.Context())
		if !doctor.UserID.Valid || doctor.UserID.Int64 != userID {
			return sqlc.Doctor{}, 0, httpx.NewError(http.StatusForbidden, "можно менять только свой профиль")
		}
		return doctor, clinicID, nil
	}
	if err := h.requireManager(r.Context()); err != nil {
		return sqlc.Doctor{}, 0, err
	}
	return doctor, clinicID, nil
}

// UploadDoctorAvatar stores a new avatar for a doctor.
func (h *Handlers) UploadDoctorAvatar(w http.ResponseWriter, r *http.Request) {
	doctor, clinicID, err := h.doctorAvatarTarget(r, true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	path, err := saveAvatar(r, w, "doctors", doctor.ID)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.UpdateDoctorAvatar(r.Context(), sqlc.UpdateDoctorAvatarParams{
		ID:         doctor.ID,
		ClinicID:   clinicID,
		AvatarPath: pgtype.Text{String: path, Valid: true},
	})
	if err != nil {
		os.Remove(path)
		httpx.Fail(w, err)
		return
	}
	removeAvatarFile(doctor.AvatarPath)
	httpx.JSON(w, http.StatusOK, toDoctorDTO(d))
}

// DeleteDoctorAvatar removes the doctor's avatar.
func (h *Handlers) DeleteDoctorAvatar(w http.ResponseWriter, r *http.Request) {
	doctor, clinicID, err := h.doctorAvatarTarget(r, true)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	d, err := h.q.UpdateDoctorAvatar(r.Context(), sqlc.UpdateDoctorAvatarParams{
		ID:       doctor.ID,
		ClinicID: clinicID,
	})
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	removeAvatarFile(doctor.AvatarPath)
	httpx.JSON(w, http.StatusOK, toDoctorDTO(d))
}

// GetDoctorAvatar streams the doctor's avatar.
func (h *Handlers) GetDoctorAvatar(w http.ResponseWriter, r *http.Request) {
	doctor, _, err := h.doctorAvatarTarget(r, false)
	if err != nil {
		httpx.Fail(w, err)
		return
	}
	serveAvatar(w, r, doctor.AvatarPath)
}
