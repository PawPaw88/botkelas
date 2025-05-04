// Fungsi untuk membersihkan kata dari karakter yang diulang
function cleanWord(word) {
  // Hapus karakter yang diulang lebih dari 2 kali
  return word.toLowerCase().replace(/(.)\1{2,}/g, "$1$1");
}

// Fungsi untuk mengecek apakah pesan mengandung kata toxic
function containsToxicWord(message) {
  // Pisahkan pesan menjadi kata-kata
  const words = message.toLowerCase().split(/\s+/);

  // Cek setiap kata
  return words.some((word) => {
    // Bersihkan kata dari karakter yang diulang
    const cleanedWord = cleanWord(word);

    // Cek apakah kata yang sudah dibersihkan cocok dengan kata toxic
    return toxicWords.some((toxic) => {
      const cleanedToxic = cleanWord(toxic);

      // Cek kecocokan dengan batasan kata
      const wordBoundary = new RegExp(`\\b${cleanedToxic}\\b`, "i");
      if (wordBoundary.test(cleanedWord)) {
        return true;
      }

      // Cek variasi penulisan dengan batasan kata
      const noVowelsWord = cleanedWord.replace(/[aiueo]/g, "");
      const noVowelsToxic = cleanedToxic.replace(/[aiueo]/g, "");
      if (noVowelsWord === noVowelsToxic && noVowelsWord.length > 2) {
        return true;
      }

      // Cek penggantian angka dengan batasan kata
      const normalizedWord = cleanedWord.replace(/0/g, "o").replace(/1/g, "i");
      const normalizedToxic = cleanedToxic
        .replace(/0/g, "o")
        .replace(/1/g, "i");
      if (normalizedWord === normalizedToxic && normalizedWord.length > 2) {
        return true;
      }

      return false;
    });
  });
}

// Fungsi untuk mendapatkan kata toxic yang digunakan
function getToxicWord(message) {
  // Pisahkan pesan menjadi kata-kata
  const words = message.toLowerCase().split(/\s+/);

  // Cek setiap kata
  for (const word of words) {
    // Bersihkan kata dari karakter yang diulang
    const cleanedWord = cleanWord(word);

    // Cek apakah kata yang sudah dibersihkan cocok dengan kata toxic
    for (const toxic of toxicWords) {
      const cleanedToxic = cleanWord(toxic);

      // Cek kecocokan dengan batasan kata
      const wordBoundary = new RegExp(`\\b${cleanedToxic}\\b`, "i");
      if (wordBoundary.test(cleanedWord)) {
        return toxic;
      }

      // Cek variasi penulisan dengan batasan kata
      const noVowelsWord = cleanedWord.replace(/[aiueo]/g, "");
      const noVowelsToxic = cleanedToxic.replace(/[aiueo]/g, "");
      if (noVowelsWord === noVowelsToxic && noVowelsWord.length > 2) {
        return toxic;
      }

      // Cek penggantian angka dengan batasan kata
      const normalizedWord = cleanedWord.replace(/0/g, "o").replace(/1/g, "i");
      const normalizedToxic = cleanedToxic
        .replace(/0/g, "o")
        .replace(/1/g, "i");
      if (normalizedWord === normalizedToxic && normalizedWord.length > 2) {
        return toxic;
      }
    }
  }

  return null;
}

// Fungsi untuk menormalisasi ID pengguna
function normalizeUserID(id) {
  if (!id) return "";
  // Hapus @g.us atau @s.whatsapp.net
  const phoneNumber = id.split("@")[0];
  // Hapus prefix grup jika ada
  const normalizedNumber = phoneNumber.split("-")[0];
  return `${normalizedNumber}@s.whatsapp.net`;
}

// Fungsi untuk menyimpan statistik kata toxic
async function saveToxicWordCount(db, playerId, word) {
  try {
    const collection = db.collection("game_stats");
    // Normalize player ID before saving
    const normalizedPlayerId = normalizeUserID(playerId);

    const playerStats = await collection.findOne({
      playerId: normalizedPlayerId,
    });

    if (playerStats) {
      // Update existing player's toxic stats
      await collection.updateOne(
        { playerId: normalizedPlayerId },
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
        playerId: normalizedPlayerId,
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

// Fungsi untuk mendapatkan top toxic players dengan ID yang dinormalisasi
async function getTopToxicPlayers(db, limit = 10) {
  try {
    const collection = db.collection("game_stats");
    const topToxicPlayers = await collection
      .find({ "toxic.totalCount": { $exists: true } })
      .sort({ "toxic.totalCount": -1 })
      .limit(limit)
      .toArray();

    // Normalize player IDs in the results
    return topToxicPlayers.map((player) => ({
      ...player,
      playerId: normalizeUserID(player.playerId),
    }));
  } catch (error) {
    console.error("Error getting top toxic players:", error);
    return [];
  }
}

// Daftar kata-kata toxic
const toxicWords = [
  "anjing",
  "anjeng",
  "babi",
  "bangsat",
  "kontol",
  "memek",
  "jancok",
  "jancuk",
  "jembot",
  "jembut",
  "goblok",
  "tolol",
  "kimak",
  "peler",
  "itil",
  "silet",
  "ngentot",
  "ngentod",
  "lonte",
  "bajingan",
  "keparat",
  "brengsek",
  "silet",
];

module.exports = {
  containsToxicWord,
  getToxicWord,
  saveToxicWordCount,
  toxicWords,
  normalizeUserID,
  getTopToxicPlayers,
};
