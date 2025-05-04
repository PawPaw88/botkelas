const questions = require("./questions");
const fetch = require("node-fetch");

// Function to save player score to database
async function savePlayerScore(db, playerId, points) {
  try {
    const collection = db.collection("game_stats");
    const playerStats = await collection.findOne({ playerId });

    if (playerStats) {
      // Update existing player's score
      await collection.updateOne(
        { playerId },
        {
          $inc: { "f100.totalPoints": points },
          $set: { lastUpdated: new Date() },
        }
      );
    } else {
      // Create new player stats
      await collection.insertOne({
        playerId,
        f100: { totalPoints: points },
        lastUpdated: new Date(),
      });
    }
  } catch (error) {
    console.error("Error saving player score:", error);
  }
}

// Function to get player stats from database
async function getPlayerStats(db, playerId) {
  try {
    const collection = db.collection("game_stats");
    const stats = await collection.findOne({ playerId });
    return (
      stats || {
        f100: { totalPoints: 0 },
        lastUpdated: new Date(),
      }
    );
  } catch (error) {
    console.error("Error getting player stats:", error);
    return {
      f100: { totalPoints: 0 },
      lastUpdated: new Date(),
    };
  }
}

// Function to get top players from database
async function getTopPlayers(db, limit = 10) {
  try {
    const collection = db.collection("game_stats");
    const topPlayers = await collection
      .find({})
      .sort({ "f100.totalPoints": -1 })
      .limit(limit)
      .toArray();
    return topPlayers;
  } catch (error) {
    console.error("Error getting top players:", error);
    return [];
  }
}

// Function to save toxic word count
async function saveToxicWordCount(db, playerId, word) {
  try {
    const collection = db.collection("game_stats");
    const playerStats = await collection.findOne({ playerId });

    if (playerStats) {
      // Update existing player's toxic stats
      await collection.updateOne(
        { playerId },
        {
          $inc: {
            "toxic.totalCount": 1,
            [`toxic.words.${word}`]: 1,
          },
          $set: { lastUpdated: new Date() },
        }
      );
    } else {
      // Create new player stats with toxic word
      await collection.insertOne({
        playerId,
        toxic: {
          totalCount: 1,
          words: { [word]: 1 },
        },
        lastUpdated: new Date(),
      });
    }
  } catch (error) {
    console.error("Error saving toxic word count:", error);
  }
}

// Function to get top toxic players
async function getTopToxicPlayers(db, limit = 10) {
  try {
    const collection = db.collection("game_stats");
    const topToxicPlayers = await collection
      .find({ "toxic.totalCount": { $exists: true } })
      .sort({ "toxic.totalCount": -1 })
      .limit(limit)
      .toArray();
    return topToxicPlayers;
  } catch (error) {
    console.error("Error getting top toxic players:", error);
    return [];
  }
}

// Function to check answer using AI
async function checkAnswerWithAI(
  question,
  userAnswer,
  correctAnswers,
  answeredQuestions = []
) {
  try {
    const prompt = `Kamu adalah asisten dalam permainan Family 100.

    - Pertanyaan: "${question}"
    - Daftar jawaban yang benar: ${correctAnswers.join(", ")}
    - Jawaban yang sudah terjawab: ${
      answeredQuestions.length > 0
        ? answeredQuestions.join(", ")
        : "Belum ada jawaban"
    }
    
    ini adalah Jawaban pemain: "${userAnswer}"
    
    Jika jawaban pemain ada di daftar jawaban yang benar / memiliki makna yang sama, benarkan jawaban pemain dan hanya berikan output:
    BENAR: jawaban
    ( jawaban harus ada dan persis di daftar jawaban )

    contoh:
    - Jawaban pemain: "mi gorng"
    - Daftar jawaban yang benar: "nasi goreng, mie goreng, ..."
    - Output: "BENAR: mie goreng"

    jika jawabannya tidak ada, berikan respon lucu sesuai yang dijawab pemain. jangan spoiler jawaban yang benar.`;

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

    // Check if the response indicates a correct answer
    if (aiResponse.toLowerCase().includes("benar:")) {
      // Extract the correct answer from the response
      const match = aiResponse.match(/benar:\s*([^\n]+)/i);
      if (match) {
        const correctAnswer = match[1].trim();
        // Verify that the extracted answer exists in the correct answers list
        if (
          correctAnswers.some(
            (ans) => ans.toLowerCase() === correctAnswer.toLowerCase()
          )
        ) {
          return {
            isCorrect: true,
            correctAnswer: correctAnswer,
            message: "🎉 Benar! Kamu mendapatkan 1 poin!",
          };
        }
      }
    }

    // If we get here, the answer was not correct
    return {
      isCorrect: false,
      correctAnswer: null,
      message: aiResponse,
    };
  } catch (error) {
    console.error("Error checking answer with AI:", error);
    // Return a friendly error message instead of throwing
    return {
      isCorrect: false,
      correctAnswer: null,
      message:
        "Maaf, sedang ada gangguan. Silakan coba lagi dalam beberapa saat.",
    };
  }
}

const gameHandler = {
  activeGames: new Map(),
  questions: require("./questions"),

  // Memulai game Family 100
  startFamily100: async (sock, sender, groupId) => {
    try {
      // Cek apakah sudah ada game yang berjalan di grup ini
      if (gameHandler.activeGames.has(groupId)) {
        await sock.sendMessage(groupId, {
          text: "❌ Sudah ada game Family 100 yang berjalan di grup ini!",
        });
        return;
      }

      // Pilih pertanyaan secara acak
      const randomIndex = Math.floor(
        Math.random() * gameHandler.questions.length
      );
      const question = gameHandler.questions[randomIndex];

      // Inisialisasi game state
      const gameState = {
        isActive: true,
        startedBy: sender,
        groupId: groupId,
        currentQuestion: question.question,
        correctAnswers: question.answers.map((a) => a.text),
        answers: new Map(),
        scores: new Map(),
        answeredBy: new Set(),
        points: question.answers.reduce((acc, ans) => {
          acc[ans.text] = ans.points;
          return acc;
        }, {}),
      };

      // Simpan game state
      gameHandler.activeGames.set(groupId, gameState);

      // Format pesan awal dengan daftar jawaban kosong
      let startMessage = `🎮 *Family 100 Dimulai!*\n\n*Pertanyaan:*\n${question.question}\n\n`;
      startMessage += `Ada ${question.answers.length} jawaban yang harus dijawab:\n\n`;

      // Tambahkan nomor jawaban kosong
      for (let i = 1; i <= question.answers.length; i++) {
        startMessage += `${i}. ...........\n`;
      }

      startMessage += `\nSilakan jawab pertanyaan di atas!\nKetik "nyerah" untuk menyerah dan mengakhiri game.`;

      // Kirim pertanyaan ke grup
      await sock.sendMessage(groupId, {
        text: startMessage,
      });
    } catch (error) {
      console.error("Error starting Family 100:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat memulai game. Silakan coba lagi.",
      });
    }
  },

  // Mengakhiri game Family 100
  endFamily100: async (sock, sender, groupId, db) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);
      if (!gameState) {
        await sock.sendMessage(groupId, {
          text: "❌ Tidak ada game Family 100 yang berjalan di grup ini!",
        });
        return;
      }

      // Save scores to database before ending game
      if (db) {
        for (const [player, score] of gameState.scores) {
          await savePlayerScore(db, player, score);
        }
      }

      // Hapus game dari activeGames
      gameHandler.activeGames.delete(groupId);

      // Format pesan akhir dengan daftar jawaban
      let endMessage = `@${
        sender.split("@")[0]
      } kamu menyerah ...\n\n🎯 *Daftar Jawaban:*\n\n`;
      let answerNumber = 1;

      // Tambahkan jawaban yang sudah diberikan
      for (const [answer, player] of gameState.answers) {
        const points = gameState.points[answer] || 0;
        const playerName = player.split("@")[0];
        endMessage += `${answerNumber}. ${answer} - ${points} @${playerName}\n`;
        answerNumber++;
      }

      // Tambahkan nomor untuk jawaban yang belum terjawab
      const remainingAnswers =
        gameState.correctAnswers.length - gameState.answers.size;
      for (let i = 0; i < remainingAnswers; i++) {
        endMessage += `${answerNumber + i}. ...........\n`;
      }

      // Kirim pesan akhir
      await sock.sendMessage(groupId, {
        text: endMessage,
        mentions: [sender],
      });
    } catch (error) {
      console.error("Error ending Family 100:", error);
      await sock.sendMessage(groupId, {
        text: "❌ Terjadi kesalahan saat mengakhiri game. Silakan coba lagi.",
      });
    }
  },

  // Memproses jawaban pemain
  processAnswer: async (sock, sender, groupId, answer, db) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);
      if (!gameState || !gameState.isActive) return;

      // Cek apakah jawaban adalah perintah menyerah
      if (answer.toLowerCase() === "nyerah") {
        await gameHandler.endFamily100(sock, sender, groupId, db);
        return;
      }

      // Get list of already answered questions
      const answeredQuestions = Array.from(gameState.answers.keys());

      // Check answer using AI
      const aiCheck = await checkAnswerWithAI(
        gameState.currentQuestion,
        answer,
        gameState.correctAnswers,
        answeredQuestions
      );

      if (aiCheck.isCorrect) {
        // Add score and track answer
        const points = gameState.points[aiCheck.correctAnswer] || 0;
        gameState.scores.set(
          sender,
          (gameState.scores.get(sender) || 0) + points
        );
        gameState.answers.set(aiCheck.correctAnswer, sender);

        // Format pesan jawaban yang sudah diberikan
        let answeredMessage = `🎯 *Daftar Jawaban:*\n\n`;
        let answerNumber = 1;

        // Tambahkan jawaban yang sudah diberikan
        for (const [ans, player] of gameState.answers) {
          const ansPoints = gameState.points[ans] || 0;
          const playerName = player.split("@")[0];
          answeredMessage += `${answerNumber}. ${ans} - ${ansPoints} @${playerName}\n`;
          answerNumber++;
        }

        // Tambahkan placeholder untuk jawaban yang belum terjawab
        const remainingAnswers =
          gameState.correctAnswers.length - gameState.answers.size;
        for (let i = 0; i < remainingAnswers; i++) {
          answeredMessage += `${answerNumber + i}. ...........\n`;
        }

        // Kirim pesan konfirmasi
        await sock.sendMessage(groupId, {
          text: `✅ @${sender.split("@")[0]} benar!\n\n${answeredMessage}`,
          mentions: [sender],
        });

        // Cek apakah semua jawaban sudah terjawab
        if (gameState.answers.size === gameState.correctAnswers.length) {
          // Format pesan akhir dengan semua jawaban
          let endMessage = `🎉 *Selamat! Semua jawaban sudah terjawab!*\n\n🎯 *Daftar Jawaban Lengkap:*\n\n`;
          let finalAnswerNumber = 1;

          // Tambahkan semua jawaban yang sudah diberikan
          for (const [ans, player] of gameState.answers) {
            const ansPoints = gameState.points[ans] || 0;
            const playerName = player.split("@")[0];
            endMessage += `${finalAnswerNumber}. ${ans} - ${ansPoints} @${playerName}\n`;
            finalAnswerNumber++;
          }

          // Tambahkan skor akhir
          endMessage += `\n🏆 *Skor Akhir:*\n`;
          const sortedScores = Array.from(gameState.scores.entries()).sort(
            (a, b) => b[1] - a[1]
          );
          for (const [player, score] of sortedScores) {
            const playerName = player.split("@")[0];
            endMessage += `📱 ${playerName}: ${score} poin\n`;
          }

          // Kirim pesan akhir dan hapus game
          await sock.sendMessage(groupId, { text: endMessage });
          gameHandler.activeGames.delete(groupId);
        }
      } else {
        await sock.sendMessage(groupId, {
          text: `@${sender.split("@")[0]} ${aiCheck.message}`,
          mentions: [sender],
        });
      }
    } catch (error) {
      console.error("Error processing answer:", error);
    }
  },

  // Menampilkan skor
  showScores: async (sock, groupId) => {
    try {
      const gameState = gameHandler.activeGames.get(groupId);
      if (!gameState) return;

      // Format pesan skor
      let scoreMessage = "*Skor Sementara:*\n\n";
      const sortedScores = Array.from(gameState.scores.entries()).sort(
        (a, b) => b[1] - a[1]
      );

      for (const [player, score] of sortedScores) {
        const phoneNumber = player.split("@")[0];
        scoreMessage += `📱 ${phoneNumber}: ${score} poin\n`;
      }

      await sock.sendMessage(groupId, { text: scoreMessage });
    } catch (error) {
      console.error("Error showing scores:", error);
    }
  },

  // Function to show player stats
  showStats: async (sock, sender, db) => {
    try {
      const playerId = sender.split("@")[0];
      const stats = await getPlayerStats(db, sender);
      const topPlayers = await getTopPlayers(db);
      const topToxicPlayers = await getTopToxicPlayers(db);

      let message = `🎮 *Statistik*\n\n`;

      // Family 100 Stats
      message += `🏆 *Top 10 Pemain Family 100:*\n\n`;
      const mentions = [];

      topPlayers.forEach((player, index) => {
        const playerId = player.playerId;
        const playerName = playerId.split("@")[0];
        message += `${index + 1}. @${playerName}: ${
          player.f100?.totalPoints || 0
        } poin\n`;
        mentions.push(playerId);
      });

      // Toxic Word Stats
      message += `\n🏆 *Orang Paling Toxic:*\n\n`;
      topToxicPlayers.forEach((player, index) => {
        const playerId = player.playerId;
        const playerName = playerId.split("@")[0];
        const totalCount = player.toxic?.totalCount || 0;
        const words = player.toxic?.words || {};

        // Get top 2 most used words
        const topWords = Object.entries(words)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([word, count]) => `${word} (${count})`)
          .join(", ");

        message += `${index + 1}. @${playerName} - ${totalCount} kata\n`;
        message += `   Kata favorit: ${topWords}\n\n`;
        mentions.push(playerId);
      });

      await sock.sendMessage(sender, {
        text: message,
        mentions: mentions,
      });
    } catch (error) {
      console.error("Error showing stats:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat menampilkan statistik.",
      });
    }
  },
};

module.exports = gameHandler;
