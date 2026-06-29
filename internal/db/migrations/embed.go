// Package migrations embeds the SQL migration files so they can be applied at
// startup without shipping the .sql files alongside the binary.
package migrations

import "embed"

// FS holds the embedded migration files (golang-migrate iofs source).
//
//go:embed *.sql
var FS embed.FS
