export interface CsvRow {
  [key: string]: string;
}

export enum FilterStatus {
  ALL = 'ALL',
  MIDDLE_HOUSING_ONLY = 'MIDDLE_HOUSING_ONLY',
  EXCLUDED = 'EXCLUDED'
}

export interface GeocodedLocation {
  lat: number;
  lng: number;
}