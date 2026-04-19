-- AlterTable
ALTER TABLE "user" ADD COLUMN     "library_sort" VARCHAR(16) NOT NULL DEFAULT 'recent',
ADD COLUMN     "library_view" VARCHAR(4) NOT NULL DEFAULT 'grid';

-- AddCheckConstraints
ALTER TABLE "user"
  ADD CONSTRAINT "ck_user_library_view"
  CHECK ("library_view" IN ('grid','list'));

ALTER TABLE "user"
  ADD CONSTRAINT "ck_user_library_sort"
  CHECK ("library_sort" IN ('recent','oldest','title_asc'));
