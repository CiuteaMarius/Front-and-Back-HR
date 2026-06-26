import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLanguage } from './LanguageContext';

export type CurrencyCode = 'RON' | 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CAD';
export type RonDisplayMode = 'code' | 'words';

export type CurrencyOption = {
  code: CurrencyCode;
  labelKey: string;
};

type CurrencyContextType = {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  ronDisplayMode: RonDisplayMode;
  setRonDisplayMode: (mode: RonDisplayMode) => void;
  currencyOptions: CurrencyOption[];
  exchangeRate: number;
  exchangeRateDate?: string;
  exchangeStatus: 'idle' | 'loading' | 'ready' | 'error';
  formatMoney: (amountRon?: number | null, options?: { compact?: boolean; maximumFractionDigits?: number; fallback?: string }) => string;
  toDisplayCurrency: (amountRon: number) => number;
  toBaseCurrency: (amountDisplay: number) => number;
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const CURRENCY_STORAGE_KEY = 'bilateralhr_currency';
const RON_DISPLAY_STORAGE_KEY = 'bilateralhr_ron_display_mode';
const RATES_STORAGE_KEY = 'bilateralhr_currency_rates';
const supportedCurrencies: CurrencyCode[] = ['RON', 'EUR', 'USD', 'GBP', 'CHF', 'CAD'];

export const currencyOptions: CurrencyOption[] = [
  { code: 'RON', labelKey: 'currencyRon' },
  { code: 'EUR', labelKey: 'currencyEur' },
  { code: 'USD', labelKey: 'currencyUsd' },
  { code: 'GBP', labelKey: 'currencyGbp' },
  { code: 'CHF', labelKey: 'currencyChf' },
  { code: 'CAD', labelKey: 'currencyCad' },
];

function storedCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return 'RON';

  const value = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
  return supportedCurrencies.includes(value as CurrencyCode) ? value as CurrencyCode : 'RON';
}

function storedRonDisplayMode(): RonDisplayMode {
  if (typeof window === 'undefined') return 'code';

  return window.localStorage.getItem(RON_DISPLAY_STORAGE_KEY) === 'words' ? 'words' : 'code';
}

function storedRates(): { rates: Partial<Record<CurrencyCode, number>>; date?: string } {
  if (typeof window === 'undefined') return { rates: { RON: 1 } };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RATES_STORAGE_KEY) || '{}');
    return {
      rates: { RON: 1, ...(parsed.rates || {}) },
      date: parsed.date,
    };
  } catch {
    return { rates: { RON: 1 } };
  }
}

function localeForLanguage(language: string) {
  if (language === 'ro') return 'ro-RO';
  if (language === 'es') return 'es-ES';
  return 'en-US';
}

function trimMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { language, t } = useLanguage();
  const [currency, setCurrencyState] = useState<CurrencyCode>(storedCurrency);
  const [ronDisplayMode, setRonDisplayModeState] = useState<RonDisplayMode>(storedRonDisplayMode);
  const [rates, setRates] = useState<Partial<Record<CurrencyCode, number>>>(() => storedRates().rates);
  const [exchangeRateDate, setExchangeRateDate] = useState<string | undefined>(() => storedRates().date);
  const [exchangeStatus, setExchangeStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const setCurrency = useCallback((nextCurrency: CurrencyCode) => {
    setCurrencyState(nextCurrency);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, nextCurrency);
    }
  }, []);

  const setRonDisplayMode = useCallback((mode: RonDisplayMode) => {
    setRonDisplayModeState(mode);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RON_DISPLAY_STORAGE_KEY, mode);
    }
  }, []);

  useEffect(() => {
    if (currency === 'RON' || rates[currency]) {
      setExchangeStatus(currency === 'RON' ? 'ready' : exchangeStatus === 'idle' ? 'ready' : exchangeStatus);
      return;
    }

    let cancelled = false;
    const targetCurrencies = supportedCurrencies.filter((item) => item !== 'RON').join(',');

    const loadRates = async () => {
      setExchangeStatus('loading');
      try {
        const response = await fetch(`https://api.frankfurter.app/latest?from=RON&to=${targetCurrencies}`);
        if (!response.ok) throw new Error('Currency rates could not be loaded.');

        const payload = await response.json();
        if (cancelled) return;

        const nextRates = { RON: 1, ...(payload.rates || {}) } as Partial<Record<CurrencyCode, number>>;
        setRates(nextRates);
        setExchangeRateDate(payload.date);
        setExchangeStatus('ready');
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify({ rates: nextRates, date: payload.date }));
        }
      } catch {
        if (!cancelled) setExchangeStatus('error');
      }
    };

    loadRates();
    return () => {
      cancelled = true;
    };
  }, [currency, rates, exchangeStatus]);

  const exchangeRate = currency === 'RON' ? 1 : rates[currency] || 1;

  const toDisplayCurrency = useCallback((amountRon: number) => trimMoney(Number(amountRon || 0) * exchangeRate), [exchangeRate]);
  const toBaseCurrency = useCallback((amountDisplay: number) => trimMoney(Number(amountDisplay || 0) / exchangeRate), [exchangeRate]);

  const formatMoney = useCallback<CurrencyContextType['formatMoney']>((amountRon, options) => {
    if (amountRon === undefined || amountRon === null || Number.isNaN(Number(amountRon))) {
      return options?.fallback ?? '-';
    }

    const convertedAmount = toDisplayCurrency(Number(amountRon));
    const maximumFractionDigits = options?.maximumFractionDigits ?? (options?.compact ? 1 : 2);
    const formattedAmount = new Intl.NumberFormat(localeForLanguage(language), {
      notation: options?.compact ? 'compact' : 'standard',
      maximumFractionDigits,
    }).format(convertedAmount);

    if (currency === 'RON' && ronDisplayMode === 'words') {
      const unit = Math.abs(convertedAmount) === 1 ? t('leu') : t('lei');
      return `${formattedAmount} ${unit}`;
    }

    return `${formattedAmount} ${currency}`;
  }, [currency, language, ronDisplayMode, t, toDisplayCurrency]);

  const value = useMemo<CurrencyContextType>(() => ({
    currency,
    setCurrency,
    ronDisplayMode,
    setRonDisplayMode,
    currencyOptions,
    exchangeRate,
    exchangeRateDate,
    exchangeStatus,
    formatMoney,
    toDisplayCurrency,
    toBaseCurrency,
  }), [
    currency,
    exchangeRate,
    exchangeRateDate,
    exchangeStatus,
    formatMoney,
    ronDisplayMode,
    setCurrency,
    setRonDisplayMode,
    toBaseCurrency,
    toDisplayCurrency,
  ]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
