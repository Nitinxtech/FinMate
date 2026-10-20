export const countryCurrencyOptions = [
  { countryCode: "US", countryName: "United States", currencyCode: "USD" },
  { countryCode: "IN", countryName: "India", currencyCode: "INR" },
  { countryCode: "GB", countryName: "United Kingdom", currencyCode: "GBP" },
  { countryCode: "CA", countryName: "Canada", currencyCode: "CAD" },
  { countryCode: "AU", countryName: "Australia", currencyCode: "AUD" },
  { countryCode: "SG", countryName: "Singapore", currencyCode: "SGD" },
  { countryCode: "AE", countryName: "United Arab Emirates", currencyCode: "AED" },
  { countryCode: "DE", countryName: "Germany", currencyCode: "EUR" },
  { countryCode: "FR", countryName: "France", currencyCode: "EUR" },
  { countryCode: "JP", countryName: "Japan", currencyCode: "JPY" },
] as const;

export const supportedCurrencies = Array.from(
  new Set(countryCurrencyOptions.map((option) => option.currencyCode)),
).sort();
