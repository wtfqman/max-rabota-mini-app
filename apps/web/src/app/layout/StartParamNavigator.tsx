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

  const match = /^(?:ad_)?(vacancy|resume|equipment|material|tool)_([a-z0-9_-]+)$/i.exec(normalized);

  if (!match) {
    return null;
  }

  const type = match[1].toLowerCase() as StartParamAdType;
  const adId = match[2];

  return `/${AD_ROUTES[type]}/${adId}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
