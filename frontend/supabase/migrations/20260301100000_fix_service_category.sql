-- Fix POIs that should be category 'service' but were incorrectly stored as 'attraction'
UPDATE points_of_interest
SET category = 'service'
WHERE category = 'attraction'
  AND sub_category IN (
    'atm', 'travelAgency', 'laundry', 'simCard', 'hospital', 'pharmacy',
    'currencyExchange', 'luggageStorage', 'touristInfo', 'supermarket',
    'tourGuide', 'driverService', 'bikeRental', 'scooterRental',
    'equipmentRental', 'locker', 'showerFacility', 'wifiHotspot',
    'coworkingSpace', 'embassy', 'otherService'
  );
