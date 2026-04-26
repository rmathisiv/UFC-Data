function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const oddsApiKey = () =>
  required("ODDS_API_KEY", process.env.ODDS_API_KEY);
