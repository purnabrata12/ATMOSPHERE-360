CREATE DATABASE IF NOT EXISTS atmosphere360 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE atmosphere360;
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS search_logs (
  id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  searched_location VARCHAR(160) NOT NULL,
  latitude FLOAT NULL,
  longitude FLOAT NULL,
  search_type VARCHAR(16) NOT NULL,
  search_status VARCHAR(16) NOT NULL,
  searched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_searched_at (searched_at),
  INDEX idx_location (searched_location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
