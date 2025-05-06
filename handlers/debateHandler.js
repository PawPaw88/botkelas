const fetch = require("node-fetch");

// Store active debates
const activeDebates = new Map();

// Debate topics
const debateTopics = [
  "Mana yang lebih penting: Uang atau Waktu?",
  "Lebih baik jadi pintar tapi miskin, atau kaya tapi bodoh?",
  "Apakah teknologi membuat manusia lebih bahagia?",
  "Apakah pendidikan formal masih relevan di era digital?",
  "Apakah media sosial lebih banyak manfaat atau mudaratnya?",
  "Apakah robot akan menggantikan pekerjaan manusia?",
  "Apakah uang bisa membeli kebahagiaan?",
  "Apakah manusia harus berhenti makan daging?",
  "Apakah AI akan menjadi ancaman bagi manusia?",
  "Apakah belajar di sekolah lebih baik daripada belajar online?",
];

// Function to evaluate debate using AI
async function evaluateDebateWithAI(topic, player1Argument, player2Argument) {
  try {
    const prompt = `Kamu adalah juri netral debat singkat. Nilailah 2 argumen dari 2 pemain berdasarkan 3 hal:
1. Kekuatan logika
2. Ketepatan terhadap topik
3. Gaya penyampaian (jelas atau menyentuh)

Berikan:
- Pemenangnya (hanya salah satu, tidak boleh seri)
- Alasan singkat (1-2 kalimat saja)
- Skor dari 100 (untuk keduanya)

Topik: ${topic}

Argumen Player 1:
"${player1Argument}"

Argumen Player 2:
"${player2Argument}"

Output format:
Pemenang: Player X
Skor: Player 1 (XX), Player 2 (XX)
Alasan: ...`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDdTWSTmbvEt42pUTiDrHwkjIY7LDpkqbs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Extract the AI response from Gemini's response format
    let aiResponse = "";
    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
    ) {
      aiResponse = data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Invalid response format from Gemini API");
    }

    // Parse the response
    const winnerMatch = aiResponse.match(/Pemenang: Player (\d)/);
    const scoreMatch = aiResponse.match(
      /Skor: Player 1 \((\d+)\), Player 2 \((\d+)\)/
    );
    const reasonMatch = aiResponse.match(/Alasan: (.+)/);

    if (!winnerMatch || !scoreMatch || !reasonMatch) {
      throw new Error("Invalid AI response format");
    }

    return {
      winner: winnerMatch[1] === "1" ? "Player 1" : "Player 2",
      score1: scoreMatch[1],
      score2: scoreMatch[2],
      reason: reasonMatch[1],
    };
  } catch (error) {
    console.error("Error evaluating debate with AI:", error);
    throw error;
  }
}

// Function to start a debate
async function startDebate(
  sock,
  sender,
  opponent,
  challengerName,
  opponentName
) {
  try {
    // Check if there's already an active debate
    if (activeDebates.has(sender)) {
      await sock.sendMessage(sender, {
        text: "❌ Sudah ada debat yang sedang berlangsung di grup ini!",
      });
      return;
    }

    // Get random topic
    const randomIndex = Math.floor(Math.random() * debateTopics.length);
    const topic = debateTopics[randomIndex];

    // Initialize debate state
    const debateState = {
      topic,
      challenger: challengerName, // Store challenger's name
      opponent: opponentName, // Store opponent's name
      challengerId: sender, // Store challenger's ID
      opponentId: opponent, // Store opponent's ID
      challengerArgument: null,
      opponentArgument: null,
      currentTurn: sender, // Challenger goes first
      isComplete: false,
    };

    // Store debate state
    activeDebates.set(sender, debateState);

    // Send initial message
    await sock.sendMessage(sender, {
      text: `🎤 *Debat Kilat Dimulai!*\nPemain: @${challengerName} vs @${opponentName}\nMenyiapkan topik...\n\n🧠 Topik: *"${topic}"*\n@${challengerName} silakan beri argumenmu terlebih dahulu.`,
      mentions: [sender, opponent],
    });
  } catch (error) {
    console.error("Error starting debate:", error);
    await sock.sendMessage(sender, {
      text: "❌ Terjadi kesalahan saat memulai debat. Silakan coba lagi.",
    });
  }
}

// Function to process argument
async function processArgument(sock, sender, argument, msg) {
  try {
    const debateState = activeDebates.get(sender);
    if (!debateState) {
      await sock.sendMessage(sender, {
        text: "❌ Tidak ada debat yang sedang berlangsung di grup ini!",
      });
      return;
    }

    // Get the actual sender ID from the message
    const actualSender = msg.key.participant || sender;
    console.log("Debug: Processing argument from:", actualSender);
    console.log("Debug: Current turn:", debateState.currentTurn);
    console.log("Debug: Challenger ID:", debateState.challengerId);
    console.log("Debug: Opponent ID:", debateState.opponentId);

    // Check if the sender is one of the debate participants
    if (
      actualSender !== debateState.challengerId &&
      actualSender !== debateState.opponentId
    ) {
      await sock.sendMessage(sender, {
        text: "❌ Hanya peserta debat yang boleh memberikan argumen!",
      });
      return;
    }

    // Check if it's the sender's turn
    if (debateState.currentTurn !== actualSender) {
      const currentSpeaker =
        actualSender === debateState.challengerId
          ? debateState.opponent
          : debateState.challenger;
      await sock.sendMessage(sender, {
        text: `❌ Bukan giliranmu untuk berbicara! Sekarang giliran @${currentSpeaker}.`,
        mentions: [debateState.currentTurn],
      });
      return;
    }

    // Store argument based on who is speaking
    if (actualSender === debateState.challengerId) {
      debateState.challengerArgument = argument;
      debateState.currentTurn = debateState.opponentId;
      await sock.sendMessage(sender, {
        text: `✅ Argumen @${debateState.challenger} tercatat.\n\nSekarang giliran @${debateState.opponent}.\n@${debateState.opponent}, silakan beri argumenmu.`,
        mentions: [debateState.opponentId],
      });
    } else {
      debateState.opponentArgument = argument;
      debateState.currentTurn = null;
      await evaluateDebate(sock, sender, debateState);
    }
  } catch (error) {
    console.error("Error processing argument:", error);
    await sock.sendMessage(sender, {
      text: "❌ Terjadi kesalahan saat memproses argumen. Silakan coba lagi.",
    });
  }
}

// Function to evaluate debate
async function evaluateDebate(sock, sender, debateState) {
  try {
    const evaluation = await evaluateDebateWithAI(
      debateState.topic,
      debateState.challengerArgument,
      debateState.opponentArgument
    );

    const winner =
      evaluation.winner === "Player 1"
        ? debateState.challenger
        : debateState.opponent;
    const winnerName =
      evaluation.winner === "Player 1"
        ? debateState.challengerName
        : debateState.opponentName;

    // Send results
    await sock.sendMessage(sender, {
      text: `🤖 *Hasil Debat Kilat:*\n\n🏆 Pemenang: @${winnerName}\n📊 Skor: @${debateState.challengerName} (${evaluation.score1}), @${debateState.opponentName} (${evaluation.score2})\n💬 Alasan: ${evaluation.reason}\n\nKetik /next jika ingin lanjut ke topik berikutnya.`,
      mentions: [debateState.challenger, debateState.opponent],
    });

    // Mark debate as complete
    debateState.isComplete = true;
  } catch (error) {
    console.error("Error evaluating debate:", error);
    await sock.sendMessage(sender, {
      text: "❌ Terjadi kesalahan saat mengevaluasi debat. Silakan coba lagi.",
    });
  }
}

// Function to start next debate
async function startNextDebate(sock, sender) {
  try {
    const debateState = activeDebates.get(sender);
    if (!debateState) {
      await sock.sendMessage(sender, {
        text: "❌ Tidak ada debat yang sedang berlangsung di grup ini!",
      });
      return;
    }

    if (!debateState.isComplete) {
      await sock.sendMessage(sender, {
        text: "❌ Debat belum selesai!",
      });
      return;
    }

    // Get new random topic
    const randomIndex = Math.floor(Math.random() * debateTopics.length);
    const newTopic = debateTopics[randomIndex];

    // Update debate state
    debateState.topic = newTopic;
    debateState.challengerArgument = null;
    debateState.opponentArgument = null;
    debateState.currentTurn = debateState.opponentId; // Previous loser goes first
    debateState.isComplete = false;

    // Send new topic message
    await sock.sendMessage(sender, {
      text: `🧠 Topik Baru: "${newTopic}"\nGiliran pertama: @${debateState.opponentName} (karena sebelumnya kalah)`,
      mentions: [debateState.opponentId],
    });
  } catch (error) {
    console.error("Error starting next debate:", error);
    await sock.sendMessage(sender, {
      text: "❌ Terjadi kesalahan saat memulai debat berikutnya. Silakan coba lagi.",
    });
  }
}

module.exports = {
  startDebate,
  processArgument,
  startNextDebate,
  activeDebates,
};
