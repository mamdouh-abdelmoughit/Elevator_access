-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Permission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cardId" INTEGER NOT NULL,
    "elevatorId" INTEGER NOT NULL,
    "relay" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Permission_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Permission_elevatorId_fkey" FOREIGN KEY ("elevatorId") REFERENCES "Elevator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Permission" ("cardId", "createdAt", "elevatorId", "id", "relay") SELECT "cardId", "createdAt", "elevatorId", "id", "relay" FROM "Permission";
DROP TABLE "Permission";
ALTER TABLE "new_Permission" RENAME TO "Permission";
CREATE UNIQUE INDEX "Permission_cardId_elevatorId_relay_key" ON "Permission"("cardId", "elevatorId", "relay");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
