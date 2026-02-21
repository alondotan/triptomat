// Exchange rate service using Frankfurter API (free, no key needed)

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

// Map country names to their currency codes
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  'United States': 'USD', 'USA': 'USD', 'Israel': 'ILS', 'United Kingdom': 'GBP', 'UK': 'GBP',
  'France': 'EUR', 'Germany': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR', 'Netherlands': 'EUR',
  'Belgium': 'EUR', 'Austria': 'EUR', 'Greece': 'EUR', 'Portugal': 'EUR', 'Ireland': 'EUR',
  'Finland': 'EUR', 'Estonia': 'EUR', 'Latvia': 'EUR', 'Lithuania': 'EUR', 'Luxembourg': 'EUR',
  'Malta': 'EUR', 'Cyprus': 'EUR', 'Slovakia': 'EUR', 'Slovenia': 'EUR', 'Croatia': 'EUR',
  'Philippines': 'PHP', 'Thailand': 'THB', 'Japan': 'JPY', 'China': 'CNY', 'South Korea': 'KRW',
  'India': 'INR', 'Malaysia': 'MYR', 'Singapore': 'SGD', 'Australia': 'AUD', 'New Zealand': 'NZD',
  'Canada': 'CAD', 'Switzerland': 'CHF', 'Sweden': 'SEK', 'Norway': 'NOK', 'Denmark': 'DKK',
  'Poland': 'PLN', 'Czech Republic': 'CZK', 'Hungary': 'HUF', 'Romania': 'RON', 'Bulgaria': 'BGN',
  'Turkey': 'TRY', 'Mexico': 'MXN', 'Brazil': 'BRL', 'Argentina': 'ARS', 'Colombia': 'COP',
  'Peru': 'PEN', 'Chile': 'CLP', 'South Africa': 'ZAR', 'Egypt': 'EGP', 'Morocco': 'MAD',
  'Indonesia': 'IDR', 'Vietnam': 'VND', 'Taiwan': 'TWD', 'Hong Kong': 'HKD',
  'United Arab Emirates': 'AED', 'Saudi Arabia': 'SAR', 'Qatar': 'QAR', 'Kuwait': 'KWD',
  'Jordan': 'JOD', 'Georgia': 'GEL', 'Iceland': 'ISK', 'Sri Lanka': 'LKR', 'Nepal': 'NPR',
  'Cambodia': 'KHR', 'Myanmar': 'MMK', 'Laos': 'LAK', 'Bangladesh': 'BDT', 'Pakistan': 'PKR',
  'Kenya': 'KES', 'Tanzania': 'TZS', 'Nigeria': 'NGN', 'Ghana': 'GHS', 'Ethiopia': 'ETB',
};

export function getCurrenciesForCountries(countries: string[]): string[] {
  const currencies = new Set<string>();
  for (const country of countries) {
    const cur = COUNTRY_CURRENCY_MAP[country];
    if (cur) currencies.add(cur);
  }
  return Array.from(currencies);
}

export async function fetchExchangeRates(
  preferredCurrency: string,
  tripCountries: string[] = []
): Promise<ExchangeRates> {
  // Collect all currencies we need rates for
  const neededCurrencies = new Set<string>(['USD', 'EUR', preferredCurrency]);
  for (const cur of getCurrenciesForCountries(tripCountries)) {
    neededCurrencies.add(cur);
  }
  neededCurrencies.delete(preferredCurrency); // We don't need rate for base currency

  const symbols = Array.from(neededCurrencies).join(',');

  try {
    // Frankfurter returns rates relative to base currency
    // We want: 1 unit of X = ? units of preferredCurrency
    // So base=preferredCurrency gives us 1/rate for conversion TO preferred
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${preferredCurrency}&symbols=${symbols}`
    );
    if (!res.ok) throw new Error(`Exchange rate API error: ${res.status}`);
    const data = await res.json();

    // data.rates gives: 1 preferredCurrency = X of other currency
    // We want: 1 of other currency = ? preferredCurrency → invert
    const invertedRates: Record<string, number> = {};
    invertedRates[preferredCurrency] = 1;
    for (const [cur, rate] of Object.entries(data.rates)) {
      invertedRates[cur] = 1 / (rate as number);
    }

    return {
      base: preferredCurrency,
      rates: invertedRates,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    // Return fallback with 1:1 rates
    const fallbackRates: Record<string, number> = {};
    fallbackRates[preferredCurrency] = 1;
    return { base: preferredCurrency, rates: fallbackRates, fetchedAt: new Date().toISOString() };
  }
}

export function convertToPreferred(
  amount: number,
  fromCurrency: string,
  rates: ExchangeRates
): number | null {
  if (fromCurrency === rates.base) return amount;
  const rate = rates.rates[fromCurrency];
  if (!rate) return null;
  return amount * rate;
}

// Fetch a single currency rate on-demand (for new currencies not in initial fetch)
export async function fetchSingleRate(
  fromCurrency: string,
  preferredCurrency: string
): Promise<number | null> {
  if (fromCurrency === preferredCurrency) return 1;
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${preferredCurrency}&symbols=${fromCurrency}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rate = data.rates?.[fromCurrency];
    if (!rate) return null;
    return 1 / rate; // invert: 1 fromCurrency = ? preferredCurrency
  } catch {
    return null;
  }
}
