const makeWASocket = require("@whiskeysockets/baileys").default;
const { MongoClient } = require("mongodb");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const scheduleHandler = require("./handlers/scheduleHandler");
const taskHandler = require("./handlers/taskHandler");
const dosenHandler = require("./handlers/dosenHandler");
const notificationHandler = require("./handlers/notificationHandler");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Bot control state
let isBotRunning = true;

// Admin number
const ADMIN_NUMBER = "6289670401161@s.whatsapp.net";

// Function to check if sender is admin
function isAdmin(sender) {
  return sender === ADMIN_NUMBER;
}

// Command handlers
const commands = {
  ".startbot": async (sock, sender) => {
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
    await sock.sendMessage(sender, {
      text: "✅ Bot berhasil diaktifkan!",
    });
  },

  ".stopbot": async (sock, sender) => {
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
    await sock.sendMessage(sender, {
      text: "✅ Bot berhasil dihentikan!",
    });
  },

  ".menu": async (sock, sender) => {
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
    // Tidak usah tambah menu komting disini

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
      `*4. Pengumuman*\n` +
      `• .broadcast [pesan]\n` +
      `  Contoh: .broadcast Pengumuman penting untuk kelas DB\n\n` +
      `*5. Persetujuan Notifikasi*\n` +
      `• .setuju_jadwal [id_jadwal]\n` +
      `  Contoh: .setuju_jadwal AB\n\n` +
      `*Catatan:*\n` +
      `• Gunakan tanda kutip (") untuk teks yang mengandung spasi\n` +
      `• Format hari: 1-7 (1=Senin, 2=Selasa, dst)\n` +
      `• Format waktu: HH:MM (contoh: 14:00)\n` +
      `• Format tanggal: YYYY-MM-DD (contoh: 2024-03-20)\n` +
      `• Ketik .ya untuk mengkonfirmasi penghapusan/pengeditan\n` +
      `• Semua notifikasi tugas dan jadwal harus disetujui sebelum dikirim ke anggota kelas`;

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

    // Create auth_info directory in Railway's persistent storage
    const authFolder = path.join(
      process.env.RAILWAY_VOLUME_MOUNT_PATH || "./",
      "auth_info"
    );
    if (!fs.existsSync(authFolder)) {
      fs.mkdirSync(authFolder, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

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
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
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
        if (shouldReconnect) {
          startBot();
        }
      } else if (connection === "open") {
        console.log("Bot berhasil terhubung!");

        // Mulai scheduler untuk pengingat jadwal kuliah
        notificationHandler.startClassReminderScheduler(sock, db);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.fromMe) {
        try {
          const sender = msg.key.remoteJid;
          // Mendapatkan teks pesan dari berbagai jenis pesan WhatsApp
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
                command.toLowerCase() === "startbot" ||
                command.toLowerCase() === "stopbot"
              ) {
                await commandHandler(sock, normalizedSenderID, db, args);
                return;
              }

              // Check if bot is running for other commands
              if (!isBotRunning) {
                await sock.sendMessage(sender, {
                  text: "❌ Bot sedang tidak aktif. Silakan hubungi admin untuk mengaktifkan bot.",
                });
                return;
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
            } else {
              // Kirim pesan error ke sumber yang sama
              await sock.sendMessage(sender, {
                text: "Perintah tidak dikenal. Ketik .menu untuk melihat daftar perintah yang tersedia.",
              });
            }
          } else {
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
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
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
