import "server-only";
import { z } from "zod";
import { cachedFetch, fetchJson, ProviderError, type Sourced } from "./cache";

/** Open-Meteo (free, non-commercial, CC BY 4.0). */
export const OPEN_METEO_URL = "https://open-meteo.com";

export interface MatchWeather {
  place: string;
  latitude: number;
  longitude: number;
  hourUtc: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  humidity: number | null;
  windKph: number | null;
  laterHumidity: number | null; // ~3h after start (second innings / dew proxy)
  note: string;
}

const Geo = z.object({
  results: z.array(z.object({ name: z.string(), latitude: z.number(), longitude: z.number(), country: z.string().optional() })).optional(),
});
const Forecast = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
  }),
});

export async function getMatchWeather(city: string, startsAtIso: string): Promise<Sourced<MatchWeather> | { unavailable: string }> {
  const start = new Date(startsAtIso);
  const daysAhead = (start.getTime() - Date.now()) / 86400000;
  if (daysAhead > 15) return { unavailable: "Forecast opens 16 days before the match." };
  if (daysAhead < -1) return { unavailable: "Match is in the past; no forecast shown." };
  try {
    return await cachedFetch(`om:${city}:${startsAtIso.slice(0, 13)}`, "Open-Meteo", 3600, async ({ setAsOf }) => {
      const geo = Geo.parse(await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`, { revalidate: 86400 }));
      const g = geo.results?.[0];
      if (!g) throw new ProviderError(`City not found: ${city}`, "invalid");
      const date = startsAtIso.slice(0, 10);
      const f = Forecast.parse(
        await fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&hourly=temperature_2m,precipitation_probability,relative_humidity_2m,wind_speed_10m&timezone=GMT&start_date=${date}&end_date=${date}`,
          { revalidate: 3600, onDate: setAsOf },
        ),
      );
      const hour = startsAtIso.slice(0, 13) + ":00";
      const i = f.hourly.time.indexOf(hour);
      const j = Math.min(f.hourly.time.length - 1, i + 3);
      if (i < 0) throw new ProviderError("Match hour not in forecast", "invalid");
      return {
        place: `${g.name}${g.country ? ", " + g.country : ""}`,
        latitude: g.latitude,
        longitude: g.longitude,
        hourUtc: hour,
        temperatureC: f.hourly.temperature_2m[i],
        precipitationProbability: f.hourly.precipitation_probability[i],
        humidity: f.hourly.relative_humidity_2m[i],
        windKph: f.hourly.wind_speed_10m[i],
        laterHumidity: f.hourly.relative_humidity_2m[j],
        note: "Hourly forecast at the scheduled start (UTC).",
      };
    });
  } catch (e) {
    return { unavailable: `Weather unavailable: ${(e as Error).message}` };
  }
}
