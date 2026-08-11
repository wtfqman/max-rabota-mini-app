import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/app-store.js';

const AD_ROUTES = {
  vacancy: 'vacancies',
  resume: 'resumes',
  equipment: 'equipment',
  material: 'materials',
  tool: 'tools'
} as const;

type StartParamAdType = keyof typeof AD_ROUTES;

export function StartParamNavigator() {
  const startParam = useAppStore((state) => state.launch.startParam);
  const navigate = useNavigate();
  const location = useLocation();
  const handledStartParamRef = useRef<string | null>(null);

  useEffect(() => {
    if (!startParam || handledStartParamRef.current === startParam) {
      return;
    }

    const targetPath = resolveStartParamPath(startParam);

    if (!targetPath) {
      return;
    }

    handledStartParamRef.current = startParam;

    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [location.pathname, navigate, startParam]);

  return null;
}

function resolveStartParamPath(startParam: string): string | null {
  const normalized = safeDecode(startParam).trim();

  if (normalized.toLowerCase() === 'moderation') {
    return '/moderation';
  }

  if (normalized.toLowerCase() === 'my_ads') {
    return '/my-ads';
  }

  if (normalized.toLowerCase() === 'profile') {
    return '/profile';
  }

  const moderationMatch = /^moderation_([a-z0-9_-]+)$/i.exec(normalized);

  if (moderationMatch) {
    return `/moderation?adId=${encodeURIComponent(moderationMatch[1])}`;
  }

  const myAdMatch = /^my_ad_([a-z0-9_-]+)$/i.exec(normalized);

  if (myAdMatch) {
    return `/my-ads?adId=${encodeURIComponent(myAdMatch[1])}`;
  }

  const paymentMatch = /^payment_([a-z0-9_-]+)$/i.exec(normalized);

  if (paymentMatch) {
    return `/profile/payments?payment=${encodeURIComponent(paymentMatch[1])}`;
  }

  const match = /^(?:ad_)?(vacancy|resume|equipment|material|tool)_([a-z0-9_-]+)$/i.exec(normalized);

  if (match) {
    const type = match[1].toLowerCase() as StartParamAdType;
    const adId = match[2];

    return `/${AD_ROUTES[type]}/${adId}`;
  }

  const legacyAdMatch = /^ad_([a-z0-9_-]+)$/i.exec(normalized);

  if (legacyAdMatch) {
    return `/ads/${legacyAdMatch[1]}`;
  }

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
