import type { Notification, Request, TranslationValues } from '../types';

type Translate = (key: string, values?: TranslationValues) => string;

function typeFromText(value: string | undefined, t: Translate) {
  const text = (value || '').toLowerCase();
  if (text.includes('medical leave')) return t('medicalLeave');
  if (text.includes('paid leave')) return t('paidLeave');
  if (text.includes('salary raise')) return t('salaryRaise');
  if (text.includes('hr message')) return t('hrMessage');
  return value || '';
}

export function requestTypeText(type: Request['type'], t: Translate) {
  if (type === 'medical-leave') return t('medicalLeave');
  if (type === 'paid-leave') return t('paidLeave');
  if (type === 'hr-message') return t('hrMessage');
  return t('salaryRaise');
}

export function notificationText(notification: Notification, t: Translate) {
  const title = notification.title || 'Notification';
  const body = notification.body || notification.message;

  if (title === 'New request received') {
    const match = body.match(/^New (.+) request from (.+)$/);
    return {
      title: t('newRequestReceived'),
      body: match
        ? t('newRequestReceivedBody', { type: typeFromText(match[1], t), name: match[2] })
        : body,
    };
  }

  if (title === 'Request approved' || title === 'Request rejected') {
    const isApproved = title === 'Request approved';
    const match = body.match(/^Your (.+) request was (approved|rejected)\.$/);
    return {
      title: isApproved ? t('requestApproved') : t('requestRejected'),
      body: match
        ? t('requestStatusBody', {
          type: typeFromText(match[1], t),
          status: isApproved ? t('approved').toLowerCase() : t('rejected').toLowerCase(),
        })
        : body,
    };
  }

  if (title === 'New leave proposal') {
    const withComment = body.match(/^Your manager proposed (\d+) leave day\(s\): (.+)$/);
    const withoutComment = body.match(/^Your manager proposed (\d+) leave day\(s\)\.$/);
    return {
      title: t('newLeaveProposal'),
      body: withComment
        ? t('leaveProposalWithComment', { count: withComment[1], comment: withComment[2] })
        : withoutComment
        ? t('leaveProposalNoComment', { count: withoutComment[1] })
        : body,
    };
  }

  if (title === 'Proposal accepted') {
    const match = body.match(/^(.+) accepted the proposed leave dates\.$/);
    return {
      title: t('proposalAccepted'),
      body: match ? t('proposalAcceptedBody', { name: match[1] }) : body,
    };
  }

  if (title === 'Proposal rejected') {
    const match = body.match(/^(.+) rejected the proposed leave dates\.$/);
    return {
      title: t('proposalRejected'),
      body: match ? t('proposalRejectedBody', { name: match[1] }) : body,
    };
  }

  if (title === 'Salary raise review requested') {
    return {
      title: t('salaryRaiseReviewRequestedTitle'),
      body,
    };
  }

  if (title === 'Manager answered salary raise review') {
    return {
      title: t('salaryRaiseReviewAnsweredTitle'),
      body,
    };
  }

  if (title === 'Salary raise approved' || title === 'Salary raise rejected') {
    return {
      title: title === 'Salary raise approved' ? t('salaryRaiseApprovedTitle') : t('salaryRaiseRejectedTitle'),
      body,
    };
  }

  if (title === 'New HR message' || title === 'HR conversation updated' || title === 'HR replied' || title === 'HR conversation closed') {
    const titleKey = title === 'New HR message'
      ? 'newHrMessage'
      : title === 'HR conversation updated'
      ? 'hrConversationUpdated'
      : title === 'HR replied'
      ? 'hrReplied'
      : 'hrConversationClosed';
    return {
      title: t(titleKey),
      body,
    };
  }

  return {
    title: title === 'Notification' ? body : title,
    body,
  };
}
