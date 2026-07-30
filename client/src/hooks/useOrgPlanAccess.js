import { useCallback, useEffect, useState } from 'react';
import {
  fetchCurrentOrgPlan,
  getCurrentOrgId,
  isOrgPlanBlocked,
  readPlanBlocked,
  setPlanBlocked,
} from '../utils/planAccess';

export function useOrgPlanAccess() {
  const [state, setState] = useState(() => ({
    ready: false,
    blocked: readPlanBlocked(),
    orgId: getCurrentOrgId(),
  }));

  const refresh = useCallback(async () => {
    const orgId = getCurrentOrgId();
    try {
      const org = await fetchCurrentOrgPlan();
      if (!org) {
        setState({ ready: true, blocked: readPlanBlocked(orgId), orgId });
        return;
      }
      const blocked = isOrgPlanBlocked(org);
      setPlanBlocked(blocked, orgId);
      setState({ ready: true, blocked, orgId, org });
    } catch {
      setState({ ready: true, blocked: readPlanBlocked(orgId), orgId });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (e) => {
      const code = e.detail?.code;
      if (code === 'TRIAL_EXPIRED' || code === 'SUBSCRIPTION_INACTIVE') {
        const orgId = getCurrentOrgId();
        setPlanBlocked(true, orgId);
        setState(prev => ({ ...prev, ready: true, blocked: true, orgId }));
      }
    };
    window.addEventListener('aio:plan-required', handler);
    return () => window.removeEventListener('aio:plan-required', handler);
  }, []);

  return { ...state, refresh };
}