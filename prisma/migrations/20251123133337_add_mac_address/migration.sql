/*
  Warnings:

  - A unique constraint covering the columns `[macAddress]` on the table `Elevator` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Elevator" ADD COLUMN "macAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Elevator_macAddress_key" ON "Elevator"("macAddress");
