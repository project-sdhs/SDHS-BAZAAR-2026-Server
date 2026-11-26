/** GET /settings/public 응답. 관리 전용 설정은 포함하지 않아요. */
export interface PublicSettings {
  appOpen: boolean;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  depositAccount: {
    bank: string;
    accountNo: string;
    holder: string;
  } | null;
  depositorNameRule: string;
  depositorNameExample: string;
  depositorNameRuleWithCode: string;
  depositorNameExampleWithCode: string;
  chargeMin: number;
  chargeMax: number | null;
  balanceLimit: number | null;
}

/** DB에서 읽은 공개 설정. 입금자명 예시는 서비스에서 규칙에 맞춰 만들어요. */
export type PublicSettingsData = Omit<
  PublicSettings,
  'depositorNameExample' | 'depositorNameExampleWithCode'
>;
