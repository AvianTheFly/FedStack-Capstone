export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export type CanonicalLabelField =
  | "brand_name"
  | "class_type"
  | "abv"
  | "net_contents"
  | "producer"
  | "country_of_origin"
  | "government_warning";

export interface ApplicationData {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  producer: string;
  country_of_origin: string;
  government_warning: string;
}

export type FieldStatus = "PASS" | "FAIL";
export type OverallVerdict = "APPROVED" | "NEEDS_REVIEW";
export type MatchType = "fuzzy" | "numeric" | "unit" | "synonym" | "exact";

export interface FieldResult {
  field: CanonicalLabelField;
  match_type: MatchType;
  expected: string;
  found: string | null;
  status: FieldStatus;
  message: string;
}

export interface VerificationResult {
  results: FieldResult[];
  overall_verdict: OverallVerdict;
  latency_ms: number | null;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}
