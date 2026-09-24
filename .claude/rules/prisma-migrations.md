---
paths:
  - "apps/api/prisma/**"
---

# Prisma schema and migrations

- Migrations are hand-written SQL in `prisma/migrations/NNNN_snake_case/migration.sql`, numbered after the last one. `schema.prisma` changes in the same commit and must describe the same result.
- Open each migration with a comment saying why the change exists, as `0006_lesson_scenario_title` does.
- **Never edit a migration that has already been applied or committed.** Fix it forward with a new one.
- Constraints the product relies on (status checks, uniqueness, a card's owner) belong in the database as `CHECK` or `UNIQUE` constraints and foreign keys, not only in service code.
- Column additions to existing tables are nullable or have a default, so rows written before the migration stay valid.
- Apply and prove it: run `MSYS_NO_PATHCONV=1 docker compose exec -w /workspace/apps/api api npx prisma migrate deploy`, then `npx prisma generate` on the host and in the container, then the integration suites that touch the table (Testcontainers applies every migration from scratch).
- A new column that other features read (for example `lesson_scenarios.title`) is worth one line in their spec or progress follow-ups.
