
export interface YearlyData {
  year: string;
  assessees: number;
  amount: number;
}

export interface TaxEntry {
  taxType: string;
  history: YearlyData[];
}

export interface DashboardData {
  entries: TaxEntry[];
  years: string[];
  taxFilingStatusByYear: {
  [year: string]: {
    name: string;
    count: number;
  }[];
};

}

export interface ChartDataPoint {
  name: string;
  value: number;
  type?: string;
}
