const questions = require("./questions");
const fetch = require("node-fetch");

// Function to check answer using AI
async function checkAnswerWithAI(question, userAnswer, correctAnswers) {
  try {
    const prompt = `Kamu adalah asisten dalam permainan Family 100 yang gaul dan lucu.

    - Pertanyaan: "${question}"
    - Daftar jawaban yang benar: ${correctAnswers.join(", ")}
    - Jawaban pemain: "${userAnswer}"
    
    Jika jawaban pemain ada di daftar jawaban yang benar / memiliki makna yang sama, benarkan jawaban pemain dan berikan output:
    "BENAR: jawaban" jawaban harus ada dan persis di daftar jawaban

    contoh:
    - Jawaban pemain: "mi gorng"
    - Daftar jawaban yang benar: "nasi goreng, mie goreng, ..."
    - Output: "BENAR: mie goreng"

    jika jawabannya tidak ada, respon dengan bahasa non formal tanpa mengulangi teks ini. jangan spoiler`;

    const response = await fetch(
      `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(
        prompt
      )}`,
      {
        timeout: 60000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return {
        isCorrect: false,
        correctAnswer: null,
        message:
          "Maaf, sedang ada gangguan. Silakan coba lagi dalam beberapa saat.",
      };
    }

    const data = await response.json();

    // Pastikan data dan answer ada
    if (data && data.answer) {
      if (data.answer.startsWith("BENAR:")) {
        const correctAnswer = data.answer.split(":")[1].trim();
        return {
          isCorrect: true,
          correctAnswer: correctAnswer,
          message: "🎉 Benar! Kamu mendapatkan 1 poin!",
        };
      } else {
        // Return the AI's response for wrong answers
        return {
          isCorrect: false,
          correctAnswer: null,
          message: data.answer,
        };
      }
    }

    // Jika tidak ada jawaban dari AI, berikan respons default
    return {
      isCorrect: false,
      correctAnswer: null,
      message: "Hmm... jawabanmu kurang tepat. Coba lagi ya! 😊",
    };
  } catch (error) {
    console.error("Error checking answer with AI:", error);
    // Return default response instead of throwing error
    return {
      isCorrect: false,
      correctAnswer: null,
      message:
        "Maaf, sedang ada gangguan. Silakan coba lagi dalam beberapa saat.",
    };
  }
}

const gameHandler = {
  // Menyimpan status game untuk setiap grup
  activeGames: new Map(),

  // Memulai game Family 100
  startFamily100: async (sock, sender, groupId) => {
    try {
      // Cek apakah game sudah berjalan di grup ini
      if (gameHandler.activeGames.has(groupId)) {
        await sock.sendMessage(groupId, {
          text: "❌ Game Family 100 sudah berjalan di grup ini!",
        });
        return;
      }

      // Pilih pertanyaan secara acak
      const randomQuestion =
        questions[Math.floor(Math.random() * questions.length)];

      // Inisialisasi game baru
      const gameState = {
        isActive: true,
        startedBy: sender,
        groupId: groupId,
        currentQuestion: randomQuestion.question,
        correctAnswers: randomQuestion.answers.map((a) => a.text),
        answers: new Map(),
        scores: new Map(),
        answeredBy: new Set(),
      };

      // Simpan status game
      gameHandler.activeGames.set(groupId, gameState);

      await sock.sendMessage(groupId, {
        text:
          "🎮 *Family 100 Dimulai!*\n\n" +
          `*Pertanyaan:*\n${randomQuestion.question}\n\n` +
          "Silakan jawab pertanyaan di atas!\n" +
          "Ketik .nyerah untuk menyerah dan mengakhiri game.\n\n" +
          "Selamat bermain! 🎯",
      });
    } catch (error) {
      console.error("Error starting Family 100:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat memulai game. Silakan coba lagi.",
      });
    }
  },

  // Mengakhiri game Family 100
  endFamily100: async (sock, sender, groupId) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);

      if (!gameState) {
        await sock.sendMessage(groupId, {
          text: "❌ Tidak ada game Family 100 yang sedang berjalan di grup ini!",
        });
        return;
      }

      // Hapus status game
      gameHandler.activeGames.delete(groupId);

      await sock.sendMessage(groupId, {
        text:
          "🏁 Game Family 100 diakhiri!\n\n" + "Terima kasih telah bermain! 👋",
      });
    } catch (error) {
      console.error("Error ending Family 100:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat mengakhiri game. Silakan coba lagi.",
      });
    }
  },

  // Memproses jawaban dari peserta
  processAnswer: async (sock, sender, groupId, answer) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);

      if (!gameState || !gameState.isActive) {
        return;
      }

      // Pastikan jawaban berasal dari grup yang memulai game
      if (gameState.groupId !== groupId) {
        return;
      }

      // Jika pengirim adalah yang memulai game, abaikan
      if (sender === gameState.startedBy) {
        return;
      }

      // Jika jawaban sudah ada dari pengirim ini, abaikan
      if (gameState.answeredBy.has(sender)) {
        await sock.sendMessage(groupId, {
          text: `@${sender.split("@")[0]} kamu sudah menjawab sebelumnya!`,
          mentions: [sender],
        });
        return;
      }

      // Check answer using AI
      const aiCheck = await checkAnswerWithAI(
        gameState.currentQuestion,
        answer,
        gameState.correctAnswers
      );

      if (aiCheck.isCorrect) {
        // Add score and track answer
        gameState.scores.set(sender, (gameState.scores.get(sender) || 0) + 1);
        gameState.answeredBy.add(sender);
        gameState.answers.set(aiCheck.correctAnswer, sender);

        // Buat daftar jawaban yang sudah dijawab dan yang belum
        let answersList = "🎯 *Daftar Jawaban:*\n\n";
        for (let i = 0; i < gameState.correctAnswers.length; i++) {
          const answer = gameState.correctAnswers[i];
          const answeredBy = gameState.answers.get(answer);
          if (answeredBy) {
            const participantName = answeredBy.split("@")[0];
            const score = gameState.scores.get(answeredBy);
            answersList += `${
              i + 1
            }. ${answer} - ${score} @${participantName}\n`;
          } else {
            answersList += `${i + 1}. ...........\n`;
          }
        }

        // Send success message with answers list
        await sock.sendMessage(groupId, {
          text: `✅ @${sender.split("@")[0]} benar!\n\n${answersList}`,
          mentions: Array.from(gameState.answeredBy),
        });

        // Check if all answers are found
        if (gameState.answeredBy.size === gameState.correctAnswers.length) {
          await gameHandler.endFamily100(sock, sender, groupId);
          await gameHandler.showScores(sock, groupId);
        }
      } else {
        // Send wrong answer message using AI's response
        await sock.sendMessage(groupId, {
          text: `@${sender.split("@")[0]} ${aiCheck.message}`,
          mentions: [sender],
        });
      }
    } catch (error) {
      console.error("Error processing answer:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat memproses jawaban. Silakan coba lagi dalam beberapa saat.",
      });
    }
  },

  // Menampilkan skor akhir
  showScores: async (sock, groupId) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);

      if (!gameState || !gameState.isActive) {
        return;
      }

      if (gameState.scores.size === 0) {
        await sock.sendMessage(groupId, {
          text: "Belum ada jawaban yang diterima.",
        });
        return;
      }

      // Urutkan skor dari tertinggi ke terendah
      const sortedScores = Array.from(gameState.scores.entries()).sort(
        (a, b) => b[1] - a[1]
      );

      let scoreMessage = "🏆 *Hasil Akhir Family 100:*\n\n";

      sortedScores.forEach(([participant, score], index) => {
        const participantName = participant.split("@")[0];
        scoreMessage += `${index + 1}. @${participantName}: ${score} poin\n`;
      });

      await sock.sendMessage(groupId, {
        text: scoreMessage,
        mentions: sortedScores.map(([participant]) => participant),
      });
    } catch (error) {
      console.error("Error showing scores:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat menampilkan skor. Silakan coba lagi.",
      });
    }
  },
};

module.exports = gameHandler;
