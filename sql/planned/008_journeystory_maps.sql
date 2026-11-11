-- PROPOSED / NOT APPLIED. Preserve every existing location_name and content row.
-- Maps links only; no paid API, geocoding, network call or automatic backfill.
CREATE TABLE journey_places (
  id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  maps_url VARCHAR(2048) NOT NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_journey_places_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT ck_journey_places_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT ck_journey_places_https CHECK (LEFT(maps_url, 8) = 'https://')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE journey_trip_places (
  trip_id CHAR(36) NOT NULL,
  place_id CHAR(36) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, place_id),
  UNIQUE KEY uq_journey_trip_place_order (trip_id, sort_order),
  CONSTRAINT fk_journey_trip_places_trip FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  CONSTRAINT fk_journey_trip_places_place FOREIGN KEY (place_id) REFERENCES journey_places(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE journey_photo_places (
  photo_id CHAR(36) NOT NULL,
  place_id CHAR(36) NOT NULL,
  PRIMARY KEY (photo_id),
  CONSTRAINT fk_journey_photo_places_photo FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_journey_photo_places_place FOREIGN KEY (place_id) REFERENCES journey_places(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CHECK is only a coarse guard. Future Admin action MUST parse URL server-side:
-- https, no credentials/custom port, exact allowlisted Google Maps hosts/path.
-- Open link with target=_blank + rel=noopener noreferrer. Never fetch its target.
