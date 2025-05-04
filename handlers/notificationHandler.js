const notificationHandler = {
  // Mendaftarkan pengguna untuk menerima notifikasi
  subscribeNotification: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar sebelumnya
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (existingUser) {
        // Jika pengguna sudah terdaftar dan aktif
        if (existingUser.isActive) {
          await sock.sendMessage(sender, {
            text: "❗ Anda sudah terdaftar untuk menerima notifikasi tugas.",
          });
          return;
        }

        // Jika pengguna terdaftar tapi tidak aktif, aktifkan kembali
        await collection.updateOne(
          { userId: normalizedSender },
          { $set: { isActive: true, updatedAt: new Date() } }
        );

        await sock.sendMessage(sender, {
          text: "✅ Notifikasi berhasil diaktifkan kembali! Anda akan menerima pemberitahuan untuk tugas baru.",
        });
        return;
      }

      // Jika pengguna belum terdaftar sama sekali
      await collection.insertOne({
        userId: normalizedSender,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await sock.sendMessage(sender, {
        text: "✅ Berhasil mendaftar notifikasi! Anda akan menerima pemberitahuan untuk tugas baru.",
      });
    } catch (error) {
      console.error("Error subscribing notification:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat mendaftar notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Menonaktifkan notifikasi untuk pengguna
  unsubscribeNotification: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (!existingUser) {
        await sock.sendMessage(sender, {
          text: "❗ Anda belum terdaftar untuk menerima notifikasi. Gunakan perintah .notifon untuk mendaftar.",
        });
        return;
      }

      // Jika pengguna terdaftar tapi sudah tidak aktif
      if (!existingUser.isActive) {
        await sock.sendMessage(sender, {
          text: "❗ Notifikasi Anda sudah dinonaktifkan sebelumnya.",
        });
        return;
      }

      // Nonaktifkan notifikasi
      await collection.updateOne(
        { userId: normalizedSender },
        { $set: { isActive: false, updatedAt: new Date() } }
      );

      await sock.sendMessage(sender, {
        text: "✅ Notifikasi berhasil dinonaktifkan. Anda tidak akan menerima pemberitahuan tugas baru.",
      });
    } catch (error) {
      console.error("Error unsubscribing notification:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat menonaktifkan notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Melihat status notifikasi pengguna
  checkNotificationStatus: async (sock, sender, db) => {
    try {
      const collection = db.collection("notifications");

      // Normalisasi ID pengirim agar konsisten
      const normalizedSender = sender.includes("@")
        ? sender
        : `${sender}@s.whatsapp.net`;

      // Cek apakah pengguna sudah terdaftar
      const existingUser = await collection.findOne({
        userId: normalizedSender,
      });

      if (!existingUser) {
        await sock.sendMessage(sender, {
          text: "❗ Anda belum terdaftar untuk menerima notifikasi. Gunakan perintah .notifon untuk mendaftar.",
        });
        return;
      }

      const status = existingUser.isActive
        ? "✅ Aktif - Anda akan menerima notifikasi tugas baru."
        : "❌ Tidak Aktif - Anda tidak akan menerima notifikasi.";

      await sock.sendMessage(sender, {
        text: `*Status Notifikasi*\n\n${status}\n\nGunakan perintah:\n.notifon - Mengaktifkan notifikasi\n.notifoff - Menonaktifkan notifikasi`,
      });
    } catch (error) {
      console.error("Error checking notification status:", error);
      await sock.sendMessage(sender, {
        text: "❌ Terjadi kesalahan saat memeriksa status notifikasi. Silakan coba lagi nanti.",
      });
    }
  },

  // Mengirim notifikasi ke semua pengguna yang berlangganan secara otomatis tanpa persetujuan komting
  sendTaskNotificationAutomatically: async (sock, db, task) => {
    try {
      const notificationCollection = db.collection("notifications");
      const taskHandler = require("./taskHandler");

      // Dapatkan semua pengguna yang aktif berlangganan
      const subscribers = await notificationCollection
        .find({ isActive: true })
        .toArray();

      if (subscribers.length === 0) {
        console.log("Tidak ada pengguna yang berlangganan notifikasi.");
        return;
      }

      // Format pesan notifikasi dengan format tanggal yang sama seperti di daftar tugas
      const message =
        `*🔔 Ada Tugas Baru!*\n\n` +
        `[ID: ${task._id}] *${task.subject}*\n` +
        `${task.title}\n` +
        `• Deadline: ${taskHandler.formatDeadline(
          new Date(task.deadline),
          task.time
        )}\n` +
        (task.description ? `• ${task.description}\n` : "") +
        `\nUntuk melihat detail lengkap, ketik .tugas`;

      // Kirim pesan ke semua subscriber
      let successCount = 0;
      const batchSize = 5; // Jumlah pesan yang dikirim dalam satu batch
      const delayBetweenBatches = 3000;

      for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);

        // Kirim pesan ke batch saat ini
        const promises = batch.map(async (subscriber) => {
          try {
            const success = await notificationHandler.sendMessageWithRetry(
              sock,
              subscriber.userId,
              { text: message }
            );

            if (success) successCount++;
          } catch (error) {
            console.error(
              `Error sending notification to ${subscriber.userId}:`,
              error
            );
          }
        });

        await Promise.all(promises);

        // Jika masih ada batch selanjutnya, tunggu beberapa detik
        if (i + batchSize < subscribers.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenBatches)
          );
        }
      }

      console.log(
        `Notifikasi tugas baru berhasil dikirim ke ${successCount} dari ${subscribers.length} pengguna.`
      );
      return successCount;
    } catch (error) {
      console.error("Error sending automatic task notifications:", error);
      return 0;
    }
  },

  // Fungsi untuk mengirim pesan WhatsApp dengan handling error dan retry
  sendMessageWithRetry: async (sock, jid, message, maxRetries = 3) => {
    let retries = 0;
    let success = false;
    let lastError = null;

    while (retries < maxRetries && !success) {
      try {
        await sock.sendMessage(jid, message);
        success = true;
      } catch (error) {
        lastError = error;
        console.log(
          `Attempt ${retries + 1} failed to send message to ${jid}. Retrying...`
        );
        // Wait a bit before retrying (increase delay with each retry)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (retries + 1))
        );
        retries++;
      }
    }

    if (!success) {
      console.error(
        `Failed to send message to ${jid} after ${maxRetries} attempts:`,
        lastError
      );
      return false;
    }

    return true;
  },
};

module.exports = notificationHandler;
