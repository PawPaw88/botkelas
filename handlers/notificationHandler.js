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
            text: "❗ Anda sudah terdaftar untuk menerima notifikasi tugas dan jadwal kuliah.",
          });
          return;
        }

        // Jika pengguna terdaftar tapi tidak aktif, aktifkan kembali
        await collection.updateOne(
          { userId: normalizedSender },
          { $set: { isActive: true, updatedAt: new Date() } }
        );

        await sock.sendMessage(sender, {
          text: "✅ Notifikasi berhasil diaktifkan kembali! Anda akan menerima pemberitahuan untuk tugas baru dan jadwal kuliah 30 menit sebelum dimulai.",
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
        text: "✅ Berhasil mendaftar notifikasi! Anda akan menerima pemberitahuan untuk tugas baru dan jadwal kuliah 30 menit sebelum dimulai.",
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
        text: "✅ Notifikasi berhasil dinonaktifkan. Anda tidak akan menerima pemberitahuan tugas baru dan jadwal kuliah.",
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
        ? "✅ Aktif - Anda akan menerima notifikasi tugas baru dan jadwal kuliah."
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

  // Fungsi untuk mengkonversi waktu ke menit (format "HH:MM" -> menit sejak tengah malam)
  convertTimeToMinutes: (timeString) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    return hours * 60 + minutes;
  },

  // Fungsi untuk mengkonversi menit ke format waktu (menit sejak tengah malam -> "HH:MM")
  convertMinutesToTime: (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  },

  // Fungsi untuk mengirim notifikasi jadwal kuliah 30 menit sebelum dimulai
  sendClassReminder: async (sock, db) => {
    try {
      const scheduleCollection = db.collection("schedules");
      const notificationCollection = db.collection("notifications_sent");
      const scheduleHandler = require("./scheduleHandler");

      // Dapatkan waktu saat ini dan konversi ke WIB (UTC+7)
      const utcNow = new Date();
      const wibOffset = 7 * 60 * 60 * 1000;
      const now = new Date(utcNow.getTime() + wibOffset);

      // Dapatkan hari saat ini dalam WIB (0 = Minggu, 1 = Senin, dst)
      const dayNames = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      const today = dayNames[now.getUTCDay()];

      // Hitung waktu saat ini dalam menit (sejak tengah malam)
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;

      // Hitung waktu 30 menit dari sekarang dalam menit
      const thirtyMinutesLater = currentTimeInMinutes + 30;

      // Format waktu untuk logging
      const currentTimeString =
        notificationHandler.convertMinutesToTime(currentTimeInMinutes);
      const targetTimeString =
        notificationHandler.convertMinutesToTime(thirtyMinutesLater);

      // Log untuk debugging waktu pencarian
      console.log(
        `[${now.toISOString()}] Waktu WIB sekarang: ${currentTimeString}`
      );
      console.log(
        `[${now.toISOString()}] Mencari jadwal untuk hari ${today} yang dimulai antara ${currentTimeString} - ${targetTimeString} WIB`
      );

      // Ambil semua jadwal hari ini
      const todaySchedules = await scheduleCollection
        .find({
          day: today,
          isRecurring: true,
        })
        .toArray();

      // Filter jadwal yang akan dimulai dalam 30 menit ke depan
      const upcomingSchedules = todaySchedules.filter((schedule) => {
        const scheduleTimeInMinutes = notificationHandler.convertTimeToMinutes(
          schedule.startTime
        );
        // Jadwal yang dimulai dalam rentang waktu sekarang hingga 30 menit ke depan
        return (
          scheduleTimeInMinutes > currentTimeInMinutes &&
          scheduleTimeInMinutes <= thirtyMinutesLater
        );
      });

      // Log hasil pencarian
      console.log(
        `[${now.toISOString()}] Ditemukan ${
          upcomingSchedules.length
        } jadwal dalam rentang waktu tersebut`
      );
      if (upcomingSchedules.length > 0) {
        console.log(
          "Jadwal yang ditemukan:",
          upcomingSchedules.map(
            (s) =>
              `${s.subject} (${s.startTime} WIB, ${Math.round(
                notificationHandler.convertTimeToMinutes(s.startTime) -
                  currentTimeInMinutes
              )} menit lagi)`
          )
        );
      }

      if (upcomingSchedules.length === 0) {
        return;
      }

      // Proses setiap jadwal yang akan dimulai
      for (const schedule of upcomingSchedules) {
        // Cek apakah notifikasi sudah dikirim dalam 30 menit terakhir
        const notificationKey = `${schedule._id}_${today}_${schedule.startTime}`;
        const existingNotification = await notificationCollection.findOne({
          notificationKey,
          sentAt: { $gte: new Date(now.getTime() - 30 * 60 * 1000) },
        });

        if (existingNotification) {
          console.log(
            `[${now.toISOString()}] Notifikasi untuk ${
              schedule.subject
            } sudah dikirim dalam 30 menit terakhir, melewati.`
          );
          continue;
        }

        // Hitung berapa menit lagi jadwal akan dimulai
        const scheduleTimeInMinutes = notificationHandler.convertTimeToMinutes(
          schedule.startTime
        );
        const minutesUntilStart = scheduleTimeInMinutes - currentTimeInMinutes;

        // Format pesan notifikasi dengan waktu yang lebih spesifik
        const message =
          `*⏰ Pengingat Jadwal Kuliah*\n\n` +
          `Hai! ${minutesUntilStart} menit lagi ada kelas *${schedule.subject}* loh. Jangan terlambat ya!\n\n` +
          `*${today}, ${schedule.startTime} WIB*\n` +
          `${scheduleHandler.formatScheduleTime(schedule)}\n\n` +
          `_Kelas akan dimulai dalam ${minutesUntilStart} menit_`;

        // Dapatkan semua pengguna yang aktif berlangganan
        const subscriberCollection = db.collection("notifications");
        const subscribers = await subscriberCollection
          .find({ isActive: true })
          .toArray();

        if (subscribers.length === 0) {
          console.log("Tidak ada pengguna yang berlangganan notifikasi.");
          continue;
        }

        // Kirim notifikasi langsung ke semua subscriber
        let successCount = 0;
        const batchSize = 5;
        const delayBetweenBatches = 3000;

        for (let i = 0; i < subscribers.length; i += batchSize) {
          const batch = subscribers.slice(i, i + batchSize);

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

          if (i + batchSize < subscribers.length) {
            await new Promise((resolve) =>
              setTimeout(resolve, delayBetweenBatches)
            );
          }
        }

        // Catat bahwa notifikasi telah dikirim
        await notificationCollection.insertOne({
          notificationKey,
          scheduleId: schedule._id,
          sentAt: now,
          successCount,
        });

        console.log(
          `[${now.toISOString()}] Notifikasi jadwal ${
            schedule.subject
          } (${minutesUntilStart} menit lagi) berhasil dikirim ke ${successCount} pengguna.`
        );
      }
    } catch (error) {
      console.error("Error sending class reminders:", error);
    }
  },

  // Fungsi untuk memulai jadwal pengecekan kelas
  startClassReminderScheduler: (sock, db) => {
    // Jalankan pengecekan setiap 15 menit
    setInterval(() => {
      notificationHandler.sendClassReminder(sock, db);
    }, 15 * 60 * 1000); // 15 menit

    console.log(
      "Pengingat jadwal kuliah berhasil dimulai dengan interval 15 menit!"
    );
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
      const delayBetweenBatches = 3000; // Delay 3 detik antar batch

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
};

module.exports = notificationHandler;
