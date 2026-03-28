// src/handlers/messageHandler.js
// Entry point for every incoming Instagram DM.
// Detects scheduling intent and drives the booking conversation state machine.

const {
  getConversation,
  upsertConversation,
  deleteConversation,
} = require('../db/conversationState');

const {
  getAvailableSlots,
  createBookingEvent,
  formatSlot,
} = require('../services/calendarService');

const {
  sendMessage,
  buildSlotOfferMessage,
  buildAskNameMessage,
  buildConfirmationMessage,
  buildNoSlotsMessage,
  buildInvalidChoiceMessage,
} = require('../services/instagramService');

// ---------------------------------------------------------------------------
// Intent detection – keyword-based (no AI required)
// ---------------------------------------------------------------------------

const SCHEDULING_KEYWORDS = [
  'book', 'booking', 'schedule', 'appointment', 'treatment',
  'available', 'availability', 'slot', 'reserve', 'reservation',
  'when can', 'free time', 'come in', 'visit',
  // Serbian / regional variants
  'rezerv', 'termin', 'zakazati', 'zakazivanje', 'slobodan',
  'tretman', 'dolazak',
];

/**
 * Returns true if the message text appears to be about scheduling.
 * @param {string} text
 * @returns {boolean}
 */
function isSchedulingIntent(text) {
  const lower = text.toLowerCase();
  return SCHEDULING_KEYWORDS.some(kw => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// State handlers
// ---------------------------------------------------------------------------

/**
 * Handle a message when there is no active conversation (idle state).
 * Checks for scheduling intent; if found, fetches slots and starts the flow.
 */
async function handleIdle(userId, text) {
  if (!isSchedulingIntent(text)) {
    // Not a scheduling message – ignore or handle other intents here later
    console.log(`[messageHandler] No scheduling intent detected from ${userId}.`);
    return;
  }

  const slots = await getAvailableSlots();

  if (slots.length === 0) {
    await sendMessage(userId, buildNoSlotsMessage());
    return;
  }

  const slotLabels = slots.map(formatSlot);

  await upsertConversation(userId, {
    state:        'awaiting_slot_choice',
    offeredSlots: slots.map(s => s instanceof Date ? s.toISOString() : s),
  });

  await sendMessage(userId, buildSlotOfferMessage(slotLabels));
}

/**
 * Handle a message when we're waiting for the user to pick a slot number.
 */
async function handleAwaitingSlotChoice(userId, text, conversation) {
  const offeredSlots = conversation.offered_slots || [];
  const choice = parseInt(text.trim(), 10);

  if (isNaN(choice) || choice < 1 || choice > offeredSlots.length) {
    await sendMessage(userId, buildInvalidChoiceMessage(offeredSlots.length));
    return;
  }

  const selectedSlot = offeredSlots[choice - 1];
  const slotLabel    = formatSlot(selectedSlot);

  await upsertConversation(userId, {
    state:        'awaiting_name',
    offeredSlots,
    selectedSlot,
  });

  await sendMessage(userId, buildAskNameMessage(slotLabel));
}

/**
 * Handle a message when we're waiting for the user's name to confirm booking.
 */
async function handleAwaitingName(userId, text, conversation) {
  const clientName   = text.trim();
  const selectedSlot = conversation.selected_slot;

  if (!clientName || clientName.length < 2) {
    await sendMessage(userId, "Could you share your full name so I can confirm the booking? 😊");
    return;
  }

  if (!selectedSlot) {
    // Shouldn't happen, but recover gracefully
    console.error(`[messageHandler] Missing selectedSlot for user ${userId}, resetting.`);
    await deleteConversation(userId);
    await sendMessage(userId, "Something went wrong on my end. Let's start over – what treatment would you like to book?");
    return;
  }

  const slotLabel = formatSlot(selectedSlot);

  // Create the Google Calendar event
  try {
    await createBookingEvent({
      startTime:       new Date(selectedSlot),
      clientName,
      instagramUserId: userId,
    });
  } catch (err) {
    console.error('[messageHandler] Failed to create calendar event:', err.message);
    await sendMessage(
      userId,
      "I'm sorry, I had trouble saving your booking right now. Please try again in a moment. 🙏"
    );
    return;
  }

  // Save final state then clean up
  await upsertConversation(userId, {
    state:        'confirmed',
    selectedSlot,
    clientName,
  });

  await sendMessage(userId, buildConfirmationMessage(clientName, slotLabel));

  // Remove conversation record – booking is complete
  await deleteConversation(userId);
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Process a single incoming Instagram DM.
 * @param {string} userId  - Instagram-scoped sender ID
 * @param {string} text    - Message text content
 */
async function handleIncomingMessage(userId, text) {
  if (!text || !text.trim()) return; // ignore empty / media-only messages

  let conversation;
  try {
    conversation = await getConversation(userId);
  } catch (err) {
    console.error('[messageHandler] DB error fetching conversation:', err.message);
    return;
  }

  const state = conversation?.state || 'idle';
  console.log(`[messageHandler] user=${userId} state=${state} text="${text.substring(0, 60)}"`);

  try {
    switch (state) {
      case 'idle':
        await handleIdle(userId, text);
        break;

      case 'awaiting_slot_choice':
        await handleAwaitingSlotChoice(userId, text, conversation);
        break;

      case 'awaiting_name':
        await handleAwaitingName(userId, text, conversation);
        break;

      case 'confirmed':
        // Edge case: user messages again right after confirming
        await deleteConversation(userId);
        await handleIdle(userId, text);
        break;

      default:
        console.warn(`[messageHandler] Unknown state "${state}" for user ${userId}, resetting.`);
        await deleteConversation(userId);
        await handleIdle(userId, text);
    }
  } catch (err) {
    console.error(`[messageHandler] Unhandled error for user ${userId}:`, err.message);
  }
}

module.exports = { handleIncomingMessage };