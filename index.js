const makeWASocket = require("@whiskeysockets/baileys").default;
const { MongoClient } = require("mongodb");
const {
  useMultiFileAuthState,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const sharp = require("sharp");
const scheduleHandler = require("./handlers/scheduleHandler");
const taskHandler = require("./handlers/taskHandler");
const dosenHandler = require("./handlers/dosenHandler");
const notificationHandler = require("./handlers/notificationHandler");
const gameHandler = require("./handlers/gameHandler");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const toxicHandler = require("./handlers/toxicHandler");
require("dotenv").config();

// Bot control state
let isBotRunning = true;
global.isBotRunning = isBotRunning;

// Admin number
const ADMIN_NUMBER = "6289670401161@s.whatsapp.net";

// Function to check if sender is admin
function isAdmin(sender) {
  return sender === ADMIN_NUMBER;
}

// Function to clean auth session
async function cleanAuthSession() {
  try {
    if (fs.existsSync("./auth_info")) {
      fs.rmSync("./auth_info", { recursive: true, force: true });
    }
    fs.mkdirSync("./auth_info", { recursive: true });
    console.log("Sesi berhasil dibersihkan");
  } catch (err) {
    console.error("Error saat membersihkan sesi:", err);
  }
}

// Function to convert image to sticker
async function convertToSticker(sock, msg, sender) {
  try {
    // Get the image message
    const imageMessage = msg.message?.imageMessage;
    if (!imageMessage) {
      throw new Error("Pesan bukan gambar");
    }

    // Download the image
    const buffer = await downloadMediaMessage(
      msg, // Pass the entire message object
      "buffer",
      {},
      {
        logger: pino({ level: "error" }),
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    if (!buffer) {
      throw new Error("Gagal mengunduh gambar");
    }

    // Process image with sharp
    const processedBuffer = await sharp(buffer)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .webp({ quality: 100 })
      .toBuffer();

    // Send as sticker
    await sock.sendMessage(sender, {
      sticker: processedBuffer,
      mimetype: "image/webp",
      isAnimated: false,
      contextInfo: {
        isForwarded: false,
        forwardingScore: 0,
        isStarred: false,
      },
      sendMediaAsSticker: true,
      stickerInfo: {
        pack: "Bot Sticker",
        author: "Bot",
      },
    });
  } catch (error) {
    console.error("Error converting to sticker:", error);

    // Kirim pesan error yang lebih spesifik
    let errorMessage = "❌ Gagal mengkonversi gambar menjadi stiker.";
    if (error.code === "ETIMEDOUT") {
      errorMessage += "\n⏱️ Waktu unduh habis. Silakan coba lagi.";
    } else if (error.message.includes("download")) {
      errorMessage += "\n📥 Gagal mengunduh gambar. Silakan coba lagi.";
    } else if (error.message.includes("bukan gambar")) {
      errorMessage = "❌ Pesan yang dikirim bukan gambar.";
    } else if (error.message.includes("No message present")) {
      errorMessage = "❌ Gagal memproses gambar. Silakan coba lagi.";
    }

    await sock.sendMessage(sender, {
      text: errorMessage,
    });
  }
}

// Function to convert sticker to image
async function convertStickerToImage(sock, msg, sender) {
  try {
    // Get the sticker message from either direct message or quoted message
    const quotedMessage =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMessage =
      msg.message?.stickerMessage || quotedMessage?.stickerMessage;

    if (!stickerMessage) {
      throw new Error("Pesan bukan sticker");
    }

    // Create a proper message object for download
    const messageToDownload = {
      key: {
        remoteJid: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        id: msg.key.id,
        participant: msg.key.participant,
      },
      message: {
        stickerMessage: stickerMessage,
      },
    };

    // Download the sticker
    const buffer = await downloadMediaMessage(
      messageToDownload,
      "buffer",
      {
        reuploadRequest: sock.updateMediaMessage,
      },
      {
        logger: pino({ level: "error" }),
      }
    );

    if (!buffer) {
      throw new Error("Gagal mengunduh sticker");
    }

    // Convert buffer to image
    const imageBuffer = await sharp(buffer).webp().toBuffer();

    // Send as image
    await sock.sendMessage(sender, {
      image: imageBuffer,
      caption: "✅ Sticker berhasil dikonversi menjadi gambar",
    });
  } catch (error) {
    console.error("Error converting sticker to image:", error);

    // Kirim pesan error yang lebih spesifik
    let errorMessage = "❌ Gagal mengkonversi sticker menjadi gambar.";
    if (error.code === "ETIMEDOUT") {
      errorMessage += "\n⏱️ Waktu unduh habis. Silakan coba lagi.";
    } else if (error.message.includes("download")) {
      errorMessage += "\n📥 Gagal mengunduh sticker. Silakan coba lagi.";
    } else if (error.message.includes("bukan sticker")) {
      errorMessage = "❌ Pesan yang dikirim bukan sticker.";
    } else if (error.message.includes("No message present")) {
      errorMessage = "❌ Silakan reply sticker yang ingin dikonversi.";
    }

    await sock.sendMessage(sender, {
      text: errorMessage,
    });
  }
}

// Function to chat with AI
async function chatWithAI(message) {
  try {
    const response = await fetch(
      `https://api.ryzendesu.vip/api/ai/deepseek?text=${encodeURIComponent(
        message
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
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.answer || "Maaf, saya tidak bisa memberikan jawaban saat ini.";
  } catch (error) {
    console.error("Error chatting with AI:", error);
    return "Maaf, terjadi kesalahan saat berkomunikasi dengan AI. Silakan coba lagi.";
  }
}

// Function to send audio file
async function sendAudio(sock, sender, quotedMsg) {
  try {
    const path = require("path");
    // Use absolute path from project root
    const audioPath = path.resolve(
      __dirname,
      "assets",
      "audio",
      "jangantoxic_vn.ogg"
    );

    console.log("Attempting to send voice note");
    console.log("Audio file path:", audioPath);

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      console.error("Audio file not found at path:", audioPath);
      return;
    }

    // Read file as buffer
    const audioBuffer = fs.readFileSync(audioPath);
    console.log(
      "Successfully read audio file, size:",
      audioBuffer.length,
      "bytes"
    );

    // Send as voice note with proper format and quote the original message
    await sock.sendMessage(
      sender,
      {
        audio: audioBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
        duration: 30, // Add duration in seconds
        waveform: new Array(30).fill(1), // Add waveform visualization
      },
      {
        quoted: quotedMsg, // Quote the original toxic message
      }
    );

    console.log("Voice note sent successfully as reply to:", sender);
  } catch (error) {
    console.error("Error sending voice note:", error);
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
  }
}

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
];

// Command handlers
const commands = {
  ".start": async (sock, sender) => {
    if (!isAdmin(sender)) {
      await sock.sendMessage(sender, {
        text: "❌ Maaf, hanya admin yang dapat menggunakan perintah ini.",
      });
      return;
    }

    if (isBotRunning) {
      await sock.sendMessage(sender, {
        text: "❌ Bot sudah berjalan.",
      });
      return;
    }

    isBotRunning = true;
    global.isBotRunning = true;

    await sock.sendMessage(sender, {
      text: "✅ Bot berhasil diaktifkan!",
    });
  },

  ".stop": async (sock, sender) => {
    if (!isAdmin(sender)) {
      await sock.sendMessage(sender, {
        text: "❌ Maaf, hanya admin yang dapat menggunakan perintah ini.",
      });
      return;
    }

    if (!isBotRunning) {
      await sock.sendMessage(sender, {
        text: "❌ Bot sudah berhenti.",
      });
      return;
    }

    isBotRunning = false;
    global.isBotRunning = false;

    await sock.sendMessage(sender, {
      text: "✅ Bot berhasil dihentikan!",
    });
  },

  ".menu": async (sock, sender) => {
    try {
      const helpText =
        `*Halo! Saya bot untuk membantu koordinasi kelas DB. Ketik .menu untuk melihat perintah yang tersedia ya*\n\n` +
        `*Perintah yang tersedia:*\n` +
        `.jadwal - Melihat jadwal kelas DB\n` +
        `.tugas - Melihat daftar tugas\n` +
        `.dosen - Melihat kontak dosen\n\n` +
        `*Perintah tambahan:*\n` +
        `.notifon - Mengaktifkan notifikasi tugas baru dan pengingat jadwal kuliah\n` +
        `.notifoff - Menonaktifkan notifikasi\n\n` +
        `Kamu bisa gunakan bot ini di pesan pribadi`;

      await sock.sendMessage(sender, {
        text: helpText,
        contextInfo: {
          externalAdReply: {
            title: "Menu Bot DB",
            body: "Mas Kentung mas kentung ...",
            thumbnailUrl:
              "https://appetiser-dev-space.sgp1.digitaloceanspaces.com/d8074db0ae90d9e53fa56bb9.jpg",
            sourceUrl:
              "https://appetiser-dev-space.sgp1.digitaloceanspaces.com/d8074db0ae90d9e53fa56bb9.jpg",
            mediaType: 1,
            showAdAttribution: false,
            renderLargerThumbnail: true,
          },
        },
      });
    } catch (error) {
      console.error("Error sending menu:", error);
      // Fallback to text-only menu if image fails
      const helpText =
        `*Halo! Saya bot untuk membantu koordinasi kelas DB. Ketik .menu untuk melihat perintah yang tersedia ya*\n\n` +
        `*Perintah yang tersedia:*\n` +
        `.jadwal - Melihat jadwal kelas DB\n` +
        `.tugas - Melihat daftar tugas\n` +
        `.dosen - Melihat kontak dosen\n\n` +
        `*Perintah tambahan:*\n` +
        `.notifon - Mengaktifkan notifikasi tugas baru dan pengingat jadwal kuliah\n` +
        `.notifoff - Menonaktifkan notifikasi\n\n` +
        `Kamu bisa gunakan bot ini di pesan pribadi`;

      await sock.sendMessage(sender, { text: helpText });
    }
  },

  ".menufun": async (sock, sender) => {
    const helpText =
      `*Menu Fun*\n\n` +
      `*Perintah yang tersedia:*\n` +
      `Belum ada perintah fun yang tersedia\n`;

    await sock.sendMessage(sender, { text: helpText });
  },

  ".menu_komting": async (sock, sender) => {
    const helpText =
      `*Menu Khusus Komting*\n\n` +
      `*1. Pengelolaan Jadwal*\n` +
      `• .tambah_jadwal [hari] [waktu] "[mata_kuliah]" "[dosen]" "[ruang]"\n` +
      `  Contoh: .tambah_jadwal 1 08:00-10:00 "Pemrograman Web" "Pak Budi" "Lab 1"\n\n` +
      `• .edit_jadwal [id] [hari] [waktu] "[mata_kuliah]" "[dosen]" "[ruang]"\n` +
      `  Contoh: .edit_jadwal AB 1 10:00-11:40 "Pemrograman Web" "Pak Budi" "Lab 1"\n\n` +
      `• .hapus_jadwal [id]\n` +
      `  Contoh: .hapus_jadwal AB\n\n` +
      `*2. Pengelolaan Tugas*\n` +
      `• .tambah_tugas "[mata_kuliah]" "[judul]" [waktu] [deadline] "[deskripsi]"\n` +
      `  Contoh: .tambah_tugas "Pemrograman Web" "Tugas 1 PHP" 14:00 2024-03-20 "Membuat CRUD"\n\n` +
      `• .edit_tugas [id] "[mata_kuliah]" "[judul]" [waktu] [deadline] "[deskripsi]"\n` +
      `  Contoh: .edit_tugas AB "Pemrograman Web" "Tugas 1 PHP" 14:00 2024-03-20 "Membuat CRUD"\n\n` +
      `• .hapus_tugas [id]\n` +
      `  Contoh: .hapus_tugas AB\n\n` +
      `*3. Pengelolaan Kontak Dosen*\n` +
      `• .tambah_dosen "[nama]" "[no_hp]"\n` +
      `  Contoh: .tambah_dosen "Prof. Dr. Budi Santoso" "08123456789"\n\n` +
      `• .edit_dosen [id] "[nama]" "[no_hp]"\n` +
      `  Contoh: .edit_dosen AB "Prof. Dr. Budi Santoso" "08123456789"\n\n` +
      `• .hapus_dosen [id]\n` +
      `  Contoh: .hapus_dosen AB\n\n` +
      `*Catatan:*\n` +
      `• Gunakan tanda kutip (") untuk teks yang mengandung spasi\n` +
      `• Format hari: 1-7 (1=Senin, 2=Selasa, dst)\n` +
      `• Format waktu: HH:MM (contoh: 14:00)\n` +
      `• Format tanggal: YYYY-MM-DD (contoh: 2024-03-20)\n` +
      `• Ketik .ya untuk mengkonfirmasi penghapusan/pengeditan\n`;

    await sock.sendMessage(sender, { text: helpText });
  },

  ".jadwal": async (sock, sender, db) => {
    await scheduleHandler.viewSchedule(sock, sender, db);
  },

  ".tambah_jadwal": async (sock, sender, db, args) => {
    await scheduleHandler.addSchedule(sock, sender, db, args);
  },

  ".edit_jadwal": async (sock, sender, db, args) => {
    await scheduleHandler.editSchedule(sock, sender, db, args);
  },

  ".hapus_jadwal": async (sock, sender, db, args) => {
    await scheduleHandler.deleteSchedule(sock, sender, db, args);
  },

  ".tugas": async (sock, sender, db) => {
    await taskHandler.viewTasks(sock, sender, db);
  },

  ".tambah_tugas": async (sock, sender, db, args) => {
    await taskHandler.addTask(sock, sender, db, args);
  },

  ".edit_tugas": async (sock, sender, db, args) => {
    await taskHandler.editTask(sock, sender, db, args);
  },

  ".hapus_tugas": async (sock, sender, db, args) => {
    await taskHandler.deleteTask(sock, sender, db, args);
  },

  ".selesai": async (sock, sender, db, args) => {
    await taskHandler.toggleTaskStatus(sock, sender, db, args);
  },

  ".dosen": async (sock, sender, db) => {
    await dosenHandler.viewDosen(sock, sender, db);
  },

  ".tambah_dosen": async (sock, sender, db, args) => {
    await dosenHandler.addDosen(sock, sender, db, args);
  },

  ".edit_dosen": async (sock, sender, db, args) => {
    await dosenHandler.editDosen(sock, sender, db, args);
  },

  ".hapus_dosen": async (sock, sender, db, args) => {
    await dosenHandler.deleteDosen(sock, sender, db, args);
  },

  ".broadcast": async (sock, sender, db, args) => {
    if (!args) {
      await sock.sendMessage(sender, {
        text: '❌ Format yang benar: .broadcast "[pesan]"',
      });
      return;
    }

    // Extract message content
    const messageMatch = args.match(/^"([^"]+)"$/);
    if (!messageMatch) {
      await sock.sendMessage(sender, {
        text: '❌ Format yang benar: .broadcast "[pesan]"\nPastikan pesan berada di dalam tanda kutip.',
      });
      return;
    }

    const messageContent = messageMatch[1];

    // Opsi: Kirim ke grup yang terdaftar
    try {
      const groupCollection = db.collection("groups");
      const groups = await groupCollection.find({}).toArray();

      if (groups.length > 0) {
        let successCount = 0;
        for (const group of groups) {
          try {
            await sock.sendMessage(group.id, { text: messageContent });
            successCount++;
          } catch (error) {
            console.error(`Error sending to group ${group.id}:`, error);
          }
        }

        await sock.sendMessage(sender, {
          text: `✅ Pesan broadcast berhasil dikirim ke ${successCount} dari ${groups.length} grup!`,
        });
        return;
      } else {
        await sock.sendMessage(sender, {
          text: "❌ Tidak ada grup yang terdaftar untuk broadcast. Silakan tambahkan grup terlebih dahulu.",
        });
      }
    } catch (error) {
      console.error("Error saat mengirim broadcast ke grup:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat mengirim broadcast.",
      });
    }
  },

  ".ya": async (sock, sender, db) => {
    const collection = db.collection("schedules");
    const taskCollection = db.collection("tasks");
    const dosenCollection = db.collection("dosen");

    // Handle pending delete schedule
    if (sock.pendingDelete) {
      const scheduleId = sock.pendingDelete;
      const result = await collection.deleteOne({ _id: scheduleId });

      if (result.deletedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Jadwal berhasil dihapus!",
        });
      }

      sock.pendingDelete = null;
      return;
    }

    // Handle pending edit schedule
    if (sock.pendingEdit) {
      const { id, day, startTime, endTime, subject, lecturer, location } =
        sock.pendingEdit;
      const result = await collection.updateOne(
        { _id: id },
        {
          $set: {
            subject,
            lecturer,
            day,
            startTime,
            endTime,
            location,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Jadwal berhasil diperbarui!",
        });
      }

      sock.pendingEdit = null;
      return;
    }

    // Handle pending delete task
    if (sock.pendingDeleteTask) {
      const taskId = sock.pendingDeleteTask;
      const result = await taskCollection.deleteOne({ _id: taskId });

      if (result.deletedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Tugas berhasil dihapus!",
        });
      }

      sock.pendingDeleteTask = null;
      return;
    }

    // Handle pending edit task
    if (sock.pendingEditTask) {
      const { id, subject, title, time, deadline, description, completedBy } =
        sock.pendingEditTask;
      const result = await taskCollection.updateOne(
        { _id: id },
        {
          $set: {
            subject,
            title,
            time,
            deadline,
            description,
            completedBy,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Tugas berhasil diperbarui!",
        });
      }

      sock.pendingEditTask = null;
      return;
    }

    // Handle pending delete dosen
    if (sock.pendingDeleteDosen) {
      const dosenId = sock.pendingDeleteDosen;
      const result = await dosenCollection.deleteOne({ _id: dosenId });

      if (result.deletedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Kontak dosen berhasil dihapus!",
        });
      }

      sock.pendingDeleteDosen = null;
      return;
    }

    // Handle pending edit dosen
    if (sock.pendingEditDosen) {
      const { id, nama, noHP } = sock.pendingEditDosen;
      const result = await dosenCollection.updateOne(
        { _id: id },
        {
          $set: {
            nama,
            noHP,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount > 0) {
        await sock.sendMessage(sender, {
          text: "✅ Kontak dosen berhasil diperbarui!",
        });
      }

      sock.pendingEditDosen = null;
      return;
    }

    await sock.sendMessage(sender, {
      text: "❌ Tidak ada operasi yang menunggu konfirmasi.",
    });
  },

  ".notifon": async (sock, sender, db) => {
    await notificationHandler.subscribeNotification(sock, sender, db);
  },

  ".notifoff": async (sock, sender, db) => {
    await notificationHandler.unsubscribeNotification(sock, sender, db);
  },

  ".setuju_jadwal": async (sock, sender, db, args) => {
    const scheduleId = args.trim();
    if (!scheduleId) {
      await sock.sendMessage(sender, {
        text: "❌ Format yang benar: .setuju_jadwal [id_jadwal]",
      });
      return;
    }
    await notificationHandler.approveScheduleNotification(
      sock,
      sender,
      db,
      scheduleId
    );
  },

  ".f100": async (sock, sender, db, args) => {
    // Cek apakah pesan dari grup
    if (!sender.endsWith("@g.us")) {
      await sock.sendMessage(sender, {
        text: "❌ Game Family 100 hanya dapat dimainkan di grup!",
      });
      return;
    }

    await gameHandler.startFamily100(sock, sender, sender);
  },

  ".nyerah": async (sock, sender, db, args) => {
    // Cek apakah pesan dari grup
    if (!sender.endsWith("@g.us")) {
      await sock.sendMessage(sender, {
        text: "❌ Game Family 100 hanya dapat dimainkan di grup!",
      });
      return;
    }

    await gameHandler.endFamily100(sock, sender, sender, db);
    await gameHandler.showScores(sock, sender);
  },

  ".tojpg": async (sock, msg, sender) => {
    try {
      // Get the sticker message from either direct message or quoted message
      const quotedMessage =
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMessage =
        msg.message?.stickerMessage || quotedMessage?.stickerMessage;

      if (!stickerMessage) {
        throw new Error("Pesan bukan sticker");
      }

      // Create a proper message object for download
      const messageToDownload = {
        key: {
          remoteJid: msg.key.remoteJid,
          fromMe: msg.key.fromMe,
          id: msg.key.id,
          participant: msg.key.participant,
        },
        message: {
          stickerMessage: stickerMessage,
        },
      };

      // Download the sticker
      const buffer = await downloadMediaMessage(
        messageToDownload,
        "buffer",
        {
          reuploadRequest: sock.updateMediaMessage,
        },
        {
          logger: pino({ level: "error" }),
        }
      );

      if (!buffer) {
        throw new Error("Gagal mengunduh sticker");
      }

      // Convert buffer to image
      const imageBuffer = await sharp(buffer).webp().toBuffer();

      // Send as image
      await sock.sendMessage(sender, {
        image: imageBuffer,
        caption: "✅ Sticker berhasil dikonversi menjadi gambar",
      });
    } catch (error) {
      console.error("Error converting sticker to image:", error);

      // Kirim pesan error yang lebih spesifik
      let errorMessage = "❌ Gagal mengkonversi sticker menjadi gambar.";
      if (error.code === "ETIMEDOUT") {
        errorMessage += "\n⏱️ Waktu unduh habis. Silakan coba lagi.";
      } else if (error.message.includes("download")) {
        errorMessage += "\n📥 Gagal mengunduh sticker. Silakan coba lagi.";
      } else if (error.message.includes("bukan sticker")) {
        errorMessage = "❌ Pesan yang dikirim bukan sticker.";
      } else if (error.message.includes("No message present")) {
        errorMessage = "❌ Silakan reply sticker yang ingin dikonversi.";
      }

      await sock.sendMessage(sender, {
        text: errorMessage,
      });
    }
  },

  ".stats": async (sock, sender, db) => {
    await gameHandler.showStats(sock, sender, db);
  },
};

// Convert all command keys to lowercase for case-insensitive matching
const caselessCommands = {};
Object.entries(commands).forEach(([key, handler]) => {
  caselessCommands[key.toLowerCase()] = handler;
});

// Fungsi untuk mengekstrak nomor telepon dari format ID WhatsApp
function extractPhoneNumber(id) {
  // Memotong @s.whatsapp.net atau @g.us dan mengambil hanya nomor telepon
  if (!id) return "";
  return id.split("@")[0];
}

// Fungsi untuk menormalisasi ID pengirim
function normalizeUserID(id) {
  if (!id) return "";
  const phoneNumber = extractPhoneNumber(id);
  return `${phoneNumber}@s.whatsapp.net`; // Selalu gunakan format pengguna, bukan grup
}

async function startBot() {
  // Check if MONGO_URI exists
  if (!process.env.MONGO_URI) {
    console.error(
      "MONGO_URI environment variable is not set! Please configure it in Railway variables."
    );
    process.exit(1);
  }

  // Updated MongoDB connection without deprecated options
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    console.log("Mencoba menghubungkan ke MongoDB Atlas...");
    await client.connect();
    console.log("Berhasil terhubung ke MongoDB Atlas!");

    const db = client.db("wa-bot");
    const collection = db.collection("messages");

    // Create auth_info directory if it doesn't exist
    if (!fs.existsSync("./auth_info")) {
      fs.mkdirSync("./auth_info", { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const logger = pino({
      level: "error",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: true,
          ignore: "pid,hostname",
        },
      },
    });

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      qrTimeout: 60000,
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 250,
      qrMaxRetries: 5,
      logger,
      session: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        maxMessages: 100,
        cleanupInterval: 60 * 60 * 1000, // 1 hour
      },
      reconnectInterval: 5000,
      maxRetries: 5,
      keepAliveIntervalMs: 25000,
      timeoutMs: 60000,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== 401;
        console.log(
          "Koneksi terputus karena ",
          lastDisconnect.error,
          "Mencoba menghubungkan ulang... ",
          shouldReconnect
        );

        // Jika error 401 (Unauthorized), hapus auth_info dan coba ulang
        if (lastDisconnect?.error?.output?.statusCode === 401) {
          console.log("Mendeteksi error 401, membersihkan sesi...");
          await cleanAuthSession();
        }

        if (shouldReconnect) {
          setTimeout(() => {
            startBot();
          }, 5000);
        }
      } else if (connection === "open") {
        console.log("Bot berhasil terhubung!");
      }
    });

    sock.ev.on("error", async (error) => {
      console.error("Error pada sesi WhatsApp:", error);

      // Handle berbagai jenis error
      if (
        error.message &&
        (error.message.includes("stale") ||
          error.message.includes("Bad MAC") ||
          error.message.includes("Connection Failure"))
      ) {
        console.log("Mendeteksi sesi yang bermasalah, membersihkan...");
        await cleanAuthSession();

        setTimeout(() => {
          startBot();
        }, 5000);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        try {
          const sender = msg.key.remoteJid;
          const messageText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";

          // Skip if message is empty or undefined
          if (!messageText) {
            return;
          }

          // Check for toxic words using the imported function
          if (toxicHandler.containsToxicWord(messageText)) {
            console.log("Toxic word detected in message:", messageText);
            try {
              // Get the toxic word
              const toxicWord = toxicHandler.getToxicWord(messageText);
              if (toxicWord) {
                // Normalize sender ID for toxic stats
                const normalizedSenderID = msg.key.participant
                  ? normalizeUserID(msg.key.participant)
                  : normalizeUserID(sender);

                // Save toxic word count to database with normalized ID
                await toxicHandler.saveToxicWordCount(
                  db,
                  normalizedSenderID,
                  toxicWord
                );
              }
              // Pass the original message object to quote it in the reply
              await sendAudio(sock, sender, msg);
              console.log("Voice note response sent successfully");
            } catch (error) {
              console.error("Failed to send voice note response:", error);
            }
            return;
          }

          // Mendapatkan ID pengirim jika dalam grup
          const rawSenderID = msg.key.participant || sender;

          // Normalisasi ID pengirim dan grup
          const normalizedSenderID = normalizeUserID(rawSenderID);

          // Cek apakah pesan dari grup
          const isGroup = sender.endsWith("@g.us");

          // Handle commands - now case-insensitive
          if (messageText.trim().startsWith(".")) {
            // Extract command and arguments, preserving case of arguments
            // Use regex to remove the dot and any spaces that might follow it
            const fullCommand = messageText.trim().replace(/^\.\s*/, "");

            // Handle empty command (just a dot with maybe spaces)
            if (!fullCommand) {
              return;
            }

            const spaceIndex = fullCommand.indexOf(" ");

            // Extract command name (before first space)
            const command =
              spaceIndex === -1
                ? fullCommand
                : fullCommand.substring(0, spaceIndex);

            // Extract arguments (after first space)
            const args =
              spaceIndex === -1
                ? []
                : fullCommand.substring(spaceIndex + 1).split(" ");

            // Look for command handler in the case-insensitive commands object
            const commandHandler =
              caselessCommands[`.${command.toLowerCase()}`];

            if (commandHandler) {
              // Allow bot control commands even when bot is stopped
              if (
                command.toLowerCase() === "start" ||
                command.toLowerCase() === "stop"
              ) {
                await commandHandler(sock, normalizedSenderID, db, args);
                return;
              }

              // Check if bot is running for other commands
              if (!isBotRunning) {
                return; // Bot is stopped, don't respond to any commands
              }

              // Cek apakah ini adalah perintah yang berkaitan dengan tugas
              if (command.toLowerCase() === "selesai") {
                // Untuk tugas, gunakan ID pengirim yang dinormalisasi (bukan grup)
                // Ini memastikan data status tugas pengguna konsisten di grup dan chat pribadi
                await commandHandler(sock, normalizedSenderID, db, args);
                // Kirim konfirmasi ke sumber pesan asli, tanpa mencantumkan status
                if (isGroup) {
                  // Jika pesan dari grup, hanya kirim konfirmasi sederhana
                  const responseText = `✅ Perintah .selesai berhasil diproses`;
                  await sock.sendMessage(sender, { text: responseText });
                }
                // Jika personal chat, respon akan dikirim oleh handler
              } else {
                // Untuk perintah lain, kirim respons ke sumber pesan (grup/pribadi)
                await commandHandler(sock, sender, db, args);
              }
            }
          } else {
            // If bot is stopped, don't process any non-command messages
            if (!isBotRunning) {
              return;
            }

            // Handle AI chat with "/" prefix
            if (messageText.startsWith("/")) {
              const aiMessage = messageText.substring(1).trim();
              if (aiMessage) {
                const aiResponse = await chatWithAI(aiMessage);
                await sock.sendMessage(sender, { text: aiResponse });
                return;
              }
            }

            // Handle sticker conversion for images with caption ".s"
            if (messageText.trim().toLowerCase() === ".s") {
              // Check if the message is a reply to an image
              const quotedMessage =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
              const imageMessage =
                msg.message?.imageMessage || quotedMessage?.imageMessage;

              if (imageMessage) {
                // Create a proper message object for download if it's a quoted message
                const messageToDownload = quotedMessage
                  ? {
                      key: {
                        remoteJid: msg.key.remoteJid,
                        fromMe:
                          msg.message.extendedTextMessage.contextInfo
                            .participant === sock.user.id,
                        id: msg.message.extendedTextMessage.contextInfo
                          .stanzaId,
                      },
                      message: {
                        imageMessage: imageMessage,
                      },
                    }
                  : msg;

                await convertToSticker(sock, messageToDownload, sender);
                return;
              } else {
                await sock.sendMessage(sender, {
                  text: "❌ Silakan kirim gambar dengan caption .s atau reply gambar dengan pesan .s",
                });
                return;
              }
            }

            // Handle sticker to image conversion with caption ".tojpg"
            if (messageText.trim().toLowerCase() === ".tojpg") {
              // Check if the message is a reply to a sticker
              const isQuotedSticker =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
                  ?.stickerMessage;
              // Check if the message itself is a sticker
              const isDirectSticker = msg.message?.stickerMessage;

              if (isQuotedSticker || isDirectSticker) {
                await commands[".tojpg"](sock, msg, sender);
                return;
              }
            }

            // Cek apakah ada game Family 100 yang aktif di grup ini
            if (isGroup && gameHandler.activeGames.has(sender)) {
              // Proses jawaban Family 100
              await gameHandler.processAnswer(
                sock,
                normalizedSenderID,
                sender,
                messageText,
                db
              );
              return;
            }

            if (
              messageText.length > 50 ||
              messageText.includes("pengumuman") ||
              messageText.includes("tugas")
            ) {
              await collection.insertOne({
                sender,
                senderID: normalizedSenderID, // Simpan ID yang dinormalisasi
                rawSenderID,
                messageText,
                isGroup,
                timestamp: new Date(),
                type: "announcement",
              });
            }
          }
        } catch (error) {
          // Log the error but don't crash
          console.error("Error processing message:", error);

          // If it's a decryption error, try to recover the session
          if (error.message && error.message.includes("Bad MAC")) {
            console.log(
              "Decryption error detected, attempting to recover session..."
            );
            const fs = require("fs");
            if (fs.existsSync("./auth_info")) {
              fs.rmSync("./auth_info", { recursive: true, force: true });
            }
            startBot();
          }
        }
      }
    });

    console.log("Bot berjalan...");
  } catch (error) {
    console.error("Error saat menghubungkan ke MongoDB:", error);
    process.exit(1);
  }
}

startBot().catch(console.error);
