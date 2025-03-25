const questions = require("./questions");

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
        groupId: groupId, // Simpan ID grup yang memulai game
        currentQuestion: randomQuestion, // Simpan pertanyaan yang dipilih
        answers: new Map(), // Menyimpan jawaban dari setiap peserta
        scores: new Map(), // Menyimpan skor setiap peserta
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
      if (gameState.answers.has(sender)) {
        return;
      }

      // Cek apakah jawaban ada dalam daftar jawaban yang benar
      const correctAnswer = gameState.currentQuestion.answers.find(
        (a) => a.text.toLowerCase() === answer.toLowerCase()
      );

      if (!correctAnswer) {
        return; // Abaikan jawaban yang salah
      }

      // Simpan jawaban
      gameState.answers.set(sender, answer);

      // Set skor sesuai dengan poin yang ditentukan
      gameState.scores.set(sender, correctAnswer.points);

      // Kirim konfirmasi jawaban
      await sock.sendMessage(groupId, {
        text:
          `✅ Jawaban benar dari @${sender.split("@")[0]}\n` +
          `Skor: ${correctAnswer.points} poin`,
        mentions: [sender],
      });
    } catch (error) {
      console.error("Error processing answer:", error);
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
