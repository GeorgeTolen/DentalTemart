package handlers

import (
	"net/http"

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
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		// Public auth endpoints.
		r.Post("/auth/login", h.Login)
		r.Post("/auth/logout", h.Logout)
		r.Post("/auth/refresh", h.Refresh)

		// Everything below requires a valid access cookie.
		r.Group(func(r chi.Router) {
			r.Use(mw.Authenticator(h.tokens))

			r.Get("/me", h.Me)

			r.Route("/appointments", func(r chi.Router) {
				r.Get("/", h.ListAppointments)
				r.Post("/", h.CreateAppointment)
				r.Get("/archive", h.CountArchivedAppointments)
				r.Delete("/archive", h.DeleteArchivedAppointments)
				r.Get("/{id}", h.GetAppointment)
				r.Put("/{id}", h.UpdateAppointment)
				r.Delete("/{id}", h.DeleteAppointment)
			})

			r.Route("/patients", func(r chi.Router) {
				r.Get("/", h.ListPatients)
				r.Post("/", h.CreatePatient)
				r.Get("/{id}", h.GetPatient)
				r.Put("/{id}", h.UpdatePatient)
				r.Delete("/{id}", h.DeletePatient)
				r.Get("/{id}/appointments", h.GetPatientAppointments)
			})

			r.Route("/doctors", func(r chi.Router) {
				r.Get("/", h.ListDoctors)
				r.Post("/", h.CreateDoctor)
				r.Put("/{id}", h.UpdateDoctor)
				r.Delete("/{id}", h.DeleteDoctor)
				r.Get("/{id}/schedule", h.GetSchedule)
				r.Put("/{id}/schedule", h.PutSchedule)
			})

			r.Route("/users", func(r chi.Router) {
				r.Get("/", h.ListUsers)
				r.Post("/", h.CreateUser)
				r.Put("/{id}", h.UpdateUser)
				r.Delete("/{id}", h.DeleteUser)
			})

			r.Get("/dashboard", h.Dashboard)
			r.Get("/admin/stats", h.AdminStats)
		})
	})

	return r
}
