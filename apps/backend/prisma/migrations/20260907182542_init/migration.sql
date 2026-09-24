-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "bpm" REAL,
    "key" TEXT,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
