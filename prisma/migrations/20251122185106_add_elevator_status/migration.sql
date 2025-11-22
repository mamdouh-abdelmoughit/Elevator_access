-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Elevator" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "currentStatus" TEXT NOT NULL DEFAULT 'IDLE',
    "lastHeartbeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Elevator" ("createdAt", "id", "latitude", "location", "longitude", "name") SELECT "createdAt", "id", "latitude", "location", "longitude", "name" FROM "Elevator";
DROP TABLE "Elevator";
ALTER TABLE "new_Elevator" RENAME TO "Elevator";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
