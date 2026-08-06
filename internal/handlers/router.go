package handlers

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"temart/internal/httpx"
	mw "temart/internal/middleware"
)

// Router builds the full HTTP router for the API.
func (h *Handlers) Router() http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.Recoverer)
	r.Use(mw.Logger)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   h.cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", mw.SupportClinicHeader},
		AllowCredentials: true,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		// Public endpoints.
		r.Get("/clinics", h.ListPublicClinics)          // login clinic picker
		r.Post("/auth/login", h.Login)                  // clinic user login
		r.Post("/auth/platform/login", h.PlatformLogin) // platform superadmin login
		r.Post("/auth/logout", h.Logout)
		r.Post("/auth/refresh", h.Refresh)

		// Everything below requires a valid access cookie.
		r.Group(func(r chi.Router) {
			r.Use(mw.Authenticator(h.tokens))

			r.Get("/me", h.Me)
			// Смена собственного пароля — для любой роли, вне режима поддержки.
			r.Post("/me/password", h.ChangeMyPassword)

			// Platform administration (superadmin only; handlers self-guard).
			r.Route("/platform", func(r chi.Router) {
				r.Get("/stats", h.PlatformStats)
				r.Get("/clinics", h.ListClinics)
				r.Post("/clinics", h.CreateClinic)
				r.Put("/clinics/{id}", h.UpdateClinic)
				r.Delete("/clinics/{id}", h.DeleteClinic)
				r.Post("/clinics/{id}/owner", h.AddClinicOwner)
				r.Post("/clinics/{id}/access", h.SetClinicAccess)

				// Staff accounts of a clinic, as seen from the platform.
				r.Get("/clinics/{id}/users", h.ListClinicUsers)
				r.Post("/clinics/{id}/users/{userId}/password", h.ResetClinicUserPassword)
				r.Delete("/clinics/{id}/users/{userId}", h.DeleteClinicUserByPlatform)

				// Platform administrators themselves.
				r.Get("/admins", h.ListPlatformAdmins)
				r.Post("/admins", h.CreatePlatformAdmin)
				r.Put("/admins/{id}", h.UpdatePlatformAdmin)
				r.Delete("/admins/{id}", h.DeletePlatformAdmin)
				r.Post("/password", h.ChangeOwnPassword)
			})

			// Clinic data. The clinic normally comes from the caller's token;
			// SupportScope additionally lets the platform superadmin read (never
			// write) a single clinic named by the support header. Замороженная
			// клиника (пробный период истёк) сюда не проходит.
			r.Group(func(r chi.Router) {
				r.Use(mw.SupportScope)
				r.Use(h.RequireClinicAccess)

				r.Route("/appointments", func(r chi.Router) {
					r.Get("/", h.ListAppointments)
					r.Post("/", h.CreateAppointment)
					r.Get("/archive", h.CountArchivedAppointments)
					r.Delete("/archive", h.DeleteArchivedAppointments)
					r.Get("/archive/list", h.ListArchivedAppointments)
					r.Get("/{id}", h.GetAppointment)
					r.Put("/{id}", h.UpdateAppointment)
					r.Delete("/{id}", h.DeleteAppointment)
					r.Get("/{id}/services", h.ListAppointmentServices)
					r.Put("/{id}/services", h.PutAppointmentServices)
				})

				// Прайс клиники и финансы (владелец и менеджер).
				r.Route("/services", func(r chi.Router) {
					r.Get("/", h.ListServices)
					r.Post("/", h.CreateService)
					r.Put("/{id}", h.UpdateService)
					r.Delete("/{id}", h.DeleteService)
				})

				r.Get("/stats/revenue", h.RevenueStats)

				r.Route("/patients", func(r chi.Router) {
					r.Get("/", h.ListPatients)
					r.Post("/", h.CreatePatient)
					r.Get("/{id}", h.GetPatient)
					r.Put("/{id}", h.UpdatePatient)
					r.Delete("/{id}", h.DeletePatient)
					r.Get("/{id}/appointments", h.GetPatientAppointments)
					r.Get("/{id}/records", h.ListPatientRecords)
					r.Post("/{id}/records", h.CreatePatientRecord)
					r.Delete("/{id}/records/{recordId}", h.DeletePatientRecord)
					r.Get("/{id}/records/{recordId}/file", h.GetPatientRecordFile)
					r.Get("/{id}/avatar", h.GetPatientAvatar)
					r.Post("/{id}/avatar", h.UploadPatientAvatar)
					r.Delete("/{id}/avatar", h.DeletePatientAvatar)
				})

				r.Route("/doctors", func(r chi.Router) {
					r.Get("/", h.ListDoctors)
					r.Post("/", h.CreateDoctor)
					r.Get("/me", h.GetMyDoctorProfile)
					r.Get("/unlinked-users", h.ListUnlinkedDoctorUsers)
					r.Put("/{id}", h.UpdateDoctor)
					r.Delete("/{id}", h.DeleteDoctor)
					r.Get("/{id}/schedule", h.GetSchedule)
					r.Put("/{id}/schedule", h.PutSchedule)
					// Профиль и аватарку врач правит сам (или менеджер за него).
					r.Put("/{id}/profile", h.UpdateDoctorProfile)
					r.Get("/{id}/avatar", h.GetDoctorAvatar)
					r.Post("/{id}/avatar", h.UploadDoctorAvatar)
					r.Delete("/{id}/avatar", h.DeleteDoctorAvatar)
				})

				r.Get("/dashboard", h.Dashboard)
				r.Get("/admin/stats", h.AdminStats)
				r.Get("/events", h.ListEvents)
			})

			r.Route("/users", func(r chi.Router) {
				r.Use(h.RequireClinicAccess)
				r.Get("/", h.ListUsers)
				r.Post("/", h.CreateUser)
				r.Put("/{id}", h.UpdateUser)
				r.Delete("/{id}", h.DeleteUser)
			})
		})
	})

	// In production the same server also serves the built SPA (single origin,
	// same-origin cookies). In development this is empty and Vite serves it.
	if h.cfg.WebDir != "" {
		r.Handle("/*", spaHandler(h.cfg.WebDir))
	}

	return r
}

// spaHandler serves static assets from dir and falls back to index.html for
// unknown paths so client-side routing (React Router) works on refresh/deep
// links. Requests under /api and /healthz are handled before this.
func spaHandler(dir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(dir))
	return func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean(r.URL.Path)
		if clean != "/" {
			if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(clean))); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		// Client-side route (or "/"): serve the SPA shell.
		if strings.HasPrefix(clean, "/assets/") {
			http.NotFound(w, r) // missing hashed asset shouldn't return HTML
			return
		}
		http.ServeFile(w, r, filepath.Join(dir, "index.html"))
	}
}
