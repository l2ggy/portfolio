CREATE TABLE visit_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_visits INTEGER NOT NULL CHECK (total_visits >= 0),
  unique_visitors INTEGER NOT NULL CHECK (unique_visitors >= 0)
);

INSERT INTO visit_totals (id, total_visits, unique_visitors)
SELECT
  1,
  COUNT(*),
  COUNT(DISTINCT CASE WHEN ip IS NOT NULL AND ip != '' THEN ip END)
FROM visits;

CREATE TABLE visit_unique_ips (
  ip TEXT PRIMARY KEY
) WITHOUT ROWID;

INSERT INTO visit_unique_ips (ip)
SELECT DISTINCT ip
FROM visits
WHERE ip IS NOT NULL AND ip != '';

CREATE TABLE visit_locations (
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon REAL NOT NULL CHECK (lon BETWEEN -180 AND 180),
  visit_count INTEGER NOT NULL CHECK (visit_count > 0),
  PRIMARY KEY (lat, lon)
) WITHOUT ROWID;

INSERT INTO visit_locations (lat, lon, visit_count)
SELECT
  ROUND(CAST(lat AS REAL), 2),
  ROUND(CAST(lon AS REAL), 2),
  COUNT(*)
FROM visits
WHERE
  typeof(lat) IN ('integer', 'real')
  AND typeof(lon) IN ('integer', 'real')
  AND lat BETWEEN -90 AND 90
  AND lon BETWEEN -180 AND 180
GROUP BY ROUND(CAST(lat AS REAL), 2), ROUND(CAST(lon AS REAL), 2);

CREATE INDEX visit_locations_by_count
ON visit_locations (visit_count DESC, lat, lon);

CREATE TRIGGER visits_aggregate_after_insert
AFTER INSERT ON visits
BEGIN
  UPDATE visit_totals
  SET total_visits = total_visits + 1
  WHERE id = 1;

  INSERT OR IGNORE INTO visit_unique_ips (ip)
  SELECT NEW.ip
  WHERE NEW.ip IS NOT NULL AND NEW.ip != '';

  UPDATE visit_totals
  SET unique_visitors = unique_visitors + changes()
  WHERE id = 1;

  INSERT INTO visit_locations (lat, lon, visit_count)
  SELECT
    ROUND(CAST(NEW.lat AS REAL), 2),
    ROUND(CAST(NEW.lon AS REAL), 2),
    1
  WHERE
    typeof(NEW.lat) IN ('integer', 'real')
    AND typeof(NEW.lon) IN ('integer', 'real')
    AND NEW.lat BETWEEN -90 AND 90
    AND NEW.lon BETWEEN -180 AND 180
  ON CONFLICT (lat, lon) DO UPDATE
  SET visit_count = visit_count + 1;
END;
