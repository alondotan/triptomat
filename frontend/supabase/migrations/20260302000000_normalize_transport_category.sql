-- Normalize transport category values to align with config.json canonical names
UPDATE transportation
SET category = CASE category
  WHEN 'flight'    THEN 'airplane'
  WHEN 'car_rental' THEN 'carRental'
  WHEN 'other'     THEN 'otherTransportation'
  ELSE category
END
WHERE category IN ('flight', 'car_rental', 'other');
