import { apiClient } from "@/src/lib/api/client";
import type {
  ApiEnvelope,
  AvailableNumber,
  PhoneNumber,
  TelephonyProvider,
} from "@/src/lib/api/types";

export interface NumberSearchParams {
  provider: TelephonyProvider;
  country: string;
  areaCode?: string;
  limit?: number;
}

export interface BuyNumberInput {
  provider: TelephonyProvider;
  phoneNumber: string;
  quoteId: string;
  friendlyName?: string;
}

export interface UpdateNumberInput {
  agentId?: string | null;
  friendlyName?: string;
}

export const numbersApi = {
  list: async (): Promise<PhoneNumber[]> => {
    const res = await apiClient.get<ApiEnvelope<PhoneNumber[]>>("/numbers");
    return res.data.data;
  },
  search: async (params: NumberSearchParams): Promise<AvailableNumber[]> => {
    const res = await apiClient.get<ApiEnvelope<AvailableNumber[]>>(
      "/numbers/search",
      { params },
    );
    return res.data.data;
  },
  buy: async (input: BuyNumberInput): Promise<PhoneNumber> => {
    const res = await apiClient.post<ApiEnvelope<PhoneNumber>>(
      "/numbers",
      input,
    );
    return res.data.data;
  },
  update: async (
    phId: string,
    input: UpdateNumberInput,
  ): Promise<PhoneNumber> => {
    const res = await apiClient.patch<ApiEnvelope<PhoneNumber>>(
      `/numbers/${phId}`,
      input,
    );
    return res.data.data;
  },
  release: async (phId: string): Promise<void> => {
    await apiClient.delete(`/numbers/${phId}`);
  },
};
