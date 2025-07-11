-- AlterTable
ALTER TABLE "Elevator" ADD COLUMN "latitude" REAL;
ALTER TABLE "Elevator" ADD COLUMN "longitude" REAL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isEmployee" BOOLEAN DEFAULT false;
ALTER TABLE "User" ADD COLUMN "latitude" REAL;
ALTER TABLE "User" ADD COLUMN "locationUpdatedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "longitude" REAL;
