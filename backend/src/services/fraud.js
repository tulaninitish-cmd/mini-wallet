// Rule-based fraud flags for transfers. Pure function: easy to unit test.
// Rules only FLAG a transfer for review; they never block it.

function evaluateTransfer({ amountMinor, recentTransferCount, isNewRecipient }, rules) {
  const reasons = [];

  if (amountMinor >= rules.largeAmountMinor) {
    reasons.push('LARGE_AMOUNT');
  }
  if (isNewRecipient && amountMinor >= rules.newRecipientLargeMinor) {
    reasons.push('NEW_RECIPIENT_LARGE_AMOUNT');
  }
  if (recentTransferCount >= rules.velocityMaxTransfers) {
    reasons.push('HIGH_VELOCITY');
  }

  return { flagged: reasons.length > 0, reasons };
}

module.exports = { evaluateTransfer };
