-- AlterTable
-- A short headline for the situation, which the classroom mockups carry on
-- the waiting room, the in-call top bar and the dashboard card. Nullable:
-- the `ready` check constraint is left as-is so any situation generated
-- before this column existed stays valid.
ALTER TABLE "lesson_scenarios" ADD COLUMN "title" VARCHAR(120);
