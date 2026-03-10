// voice.js  —  Updated for reliable speech verification + recording
const { VoiceResponse } = require('twilio').twiml;
const User = require('./models/user');

// NATO phonetic alphabet — much clearer for speech recognition
const wordDict = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

function generateCodes() {
  return Array.from({ length: 5 }, () => wordDict[Math.floor(Math.random() * wordDict.length)]);
}

// Simple Levenshtein distance for fuzzy matching (allows 1 typo)
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

async function handleCall(req, res) {
  console.log('=== INCOMING VOICE WEBHOOK ===');
  console.log('From:', req.body.From);
  console.log('SpeechResult:', req.body.SpeechResult || '(no speech yet)');
  console.log('RecordingUrl (if any):', req.body.RecordingUrl || '(none)');

  const twiml = new VoiceResponse();
  const user = await User.findOne({ phone: req.body.From });

  if (!user || user.status !== 'verified') {
    twiml.say('Invalid session. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  if (user.attempts >= 2) {
    user.status = 'failed';
    await user.save();
    twiml.say('Too many attempts. Test failed. Goodbye.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  const speechResult = req.body.SpeechResult;
  const recordingUrl = req.body.RecordingUrl;

  if (recordingUrl) {
    console.log(`Recording available: ${recordingUrl}`);
  }

  if (speechResult) {
    const spoken = speechResult.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const expected = user.codeWords.map(w => w.toLowerCase());

    // Fuzzy match: allow up to 1 edit distance per word
    const isMatch = spoken.length === 5 &&
      spoken.every((word, i) => levenshtein(word, expected[i]) <= 1);

    console.log(`Expected: ${expected.join(' ')}`);
    console.log(`Heard:    ${spoken.join(' ')}`);
    console.log(`Match? ${isMatch}`);

    if (isMatch) {
      user.status = 'success';
      await user.save();
      twiml.say('Verification successful. Thank you. Goodbye.');
      twiml.hangup();
    } else {
      user.attempts++;
      await user.save();
      if (user.attempts >= 2) {
        user.status = 'failed';
        await user.save();
        twiml.say('Too many attempts. Test failed. Goodbye.');
        twiml.hangup();
      } else {
        twiml.say('Incorrect. Try again.');
        const gather = twiml.gather({
          input: 'speech',
          speechTimeout: 'auto',
          action: '/twilio-voice',
          method: 'POST',
          hints: user.codeWords.join(', '),     // ← tells Twilio what to expect
          language: 'en-US',
          record: true,                         // ← records every attempt
          recordingStatusCallback: '/recording-status'  // optional, but logs URL
        });
        gather.say('Please read your 5 code words clearly.');
      }
    }
  } else {
    // First prompt
    const gather = twiml.gather({
      input: 'speech',
      speechTimeout: 'auto',
      action: '/twilio-voice',
      method: 'POST',
      hints: user.codeWords.join(', '),
      language: 'en-US',
      record: true
    });
    gather.say('Please read your 5 code words clearly.');
  }

  res.type('text/xml').send(twiml.toString());
}

module.exports = { handleCall, generateCodes };