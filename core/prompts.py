def build_main_prompt(allowed_types, geo_types):
    """Builds the main analysis prompt with the given type lists."""
    return f"""
Extract the recommendations from the input you got.
Your output must be a RFC8259 compliant JSON object with the following structure:

{{
      "sites_hierarchy": [
                    {{
                        "site": "Country Name",
                        "site_type": "country",
                        "sub_sites": [
                            {{
                                "site": "City/State Name/Region",
                                "site_type": "city",
                                "sub_sites": []
                            }}
                        ]
                    }}
        ],
    "recommendations": [
        {{
            "name": "Name of the specific place or attraction",
            "category": "Must be one of the allowed types listed below",
            "sentiment": "good | bad",
            "paragraph": "The exact quote or sentence from the video describing this place",
            "site": "The location/neighborhood/city from the sitesList",
            "location_type": "specific | general",
            "location": {{
                "address": "string",
                "coordinates": {{
                    "lat": 0,
                    "lng": 0
                }}
            }}
        }}
    ],
    "contacts": [
        {{
            "name": "Name of the person or business",
            "role": "guide | host | rental | restaurant | driver | agency | other",
            "phone": "phone number if mentioned, else null",
            "email": "email if mentioned, else null",
            "website": "website or social media link if mentioned, else null",
            "paragraph": "The exact quote mentioning this contact",
            "site": "The location/city"
        }}
    ]
}}

### Rules:
1. Category must be strictly from: {", ".join(allowed_types)}.
2. The sites_hierarchy (Nested Structure):
 2.1 Construct a nested geographical tree under the key "sites_hierarchy".
 2.2 The first level must be the country or countries that in the mail.
 2.3 Each node must be an object: {{"site": "Name", "site_type": "Type", "sub_sites": []}}.
 2.4 Use "sub_sites" only if child locations exist.
 2.5 The sites_hierarchy must represent a geographical hierarchy and must be strictly from: {geo_types}
 2.6 The hierarchy MUST follow a logical path:  Country -> State/Region -> City -> Neighborhood/POI.
 2.7 The sites_hierarchy should only contain the sites of the recommendations.
 2.8 All values in the sites_hierarchy must be the english names.

3. Location Handling:
 3.1 Identify if the recommendation is "specific" (a concrete business, hotel, restaurant, or landmark) or "general" (e.g., "beaches", "nightlife", "atmosphere", "shopping areas" in general).
 3.2 Set "location_type" accordingly.
 3.3 IF "location_type" is "general", leave the "location" object with null or empty strings.
 3.4 IF "location_type" is "specific", fill the "location" object ONLY if the information is explicitly provided or clearly inferred.
 3.5 Put coordinates and address only if unknown.
4. The recommendations
 4.1 The data in the paragraph should be in the origen language
5. Contacts Extraction:
 5.1 Extract contacts when a specific person, guide, host, driver, agency, or service provider is recommended by name.
 5.2 Do not extract generic business names that are already captured as recommendations — only extract contacts when there is personal/direct contact information or a personal recommendation for a specific provider.
 5.3 The "role" must be one of: guide, host, rental, restaurant, driver, agency, other.
 5.4 Include phone, email, or website only if explicitly mentioned. Otherwise set to null.
 5.5 If no contacts are found, return an empty array.
6. Only provide the JSON object. No prose or explanations.
7. Perform a JSON integrity check before responding.
"""
