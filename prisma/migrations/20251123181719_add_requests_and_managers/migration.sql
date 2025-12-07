-- AlterTable
ALTER TABLE "Card" ADD COLUMN "label" TEXT;

-- CreateTable
CREATE TABLE "Request" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syndicId" INTEGER NOT NULL,
    "elevatorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "residentName" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Request_syndicId_fkey" FOREIGN KEY ("syndicId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Request_elevatorId_fkey" FOREIGN KEY ("elevatorId") REFERENCES "Elevator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Elevator" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "managerId" INTEGER,
    "latitude" REAL,
    "longitude" REAL,
    "currentStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "macAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Elevator_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Elevator" ("createdAt", "currentStatus", "id", "lastHeartbeat", "latitude", "location", "longitude", "macAddress", "name") SELECT "createdAt", "currentStatus", "id", "lastHeartbeat", "latitude", "location", "longitude", "macAddress", "name" FROM "Elevator";
DROP TABLE "Elevator";
ALTER TABLE "new_Elevator" RENAME TO "Elevator";
CREATE UNIQUE INDEX "Elevator_macAddress_key" ON "Elevator"("macAddress");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
