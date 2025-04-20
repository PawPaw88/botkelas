const scheduleHandler = {
  // Fungsi untuk menghasilkan ID unik 2 huruf
  generateUniqueId: () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let id;
    do {
      id =
        letters[Math.floor(Math.random() * letters.length)] +
        letters[Math.floor(Math.random() * letters.length)];
    } while (id === "ID"); // Hindari kombinasi yang mungkin membingungkan
    return id;
  },

  // Format jadwal dengan tampilan yang lebih bagus
  formatScheduleTime: (schedule) => {
    return `${schedule.startTime}-${schedule.endTime} | *${schedule.subject}* | ${schedule.lecturer} | ${schedule.location}`;
  },

  viewSchedule: async (sock, sender, db, showIds = false) => {
    const collection = db.collection("schedules");

    // Mengurutkan berdasarkan hari dan waktu, tanpa memperdulikan tanggal
    const schedules = await collection
      .find({})
      .sort({
        day: 1,
        startTime: 1,
      })
      .toArray();

    if (schedules.length === 0) {
      await sock.sendMessage(sender, {
        text: "Belum ada jadwal yang ditambahkan.",
      });
      return;
    }

    // Mengelompokkan jadwal berdasarkan hari
    const groupedSchedules = {};
    schedules.forEach((schedule) => {
      if (!groupedSchedules[schedule.day]) {
        groupedSchedules[schedule.day] = [];
      }
      groupedSchedules[schedule.day].push(schedule);
    });

    let scheduleList = "*Jadwal Kelas DB:*\n\n";

    // Urutan hari yang diinginkan
    const dayOrder = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];

    // Menampilkan jadwal per hari sesuai urutan
    dayOrder.forEach((day) => {
      if (groupedSchedules[day]) {
        scheduleList += `*${day}*\n`;
        groupedSchedules[day].forEach((schedule) => {
          if (showIds) {
            scheduleList += `[ID: ${schedule._id}] `;
          }
          scheduleList += `${scheduleHandler.formatScheduleTime(schedule)}\n`;
        });
        scheduleList += "\n";
      }
    });
    await sock.sendMessage(sender, { text: scheduleList });
  },

  addSchedule: async (sock, sender, db, args) => {
    if (args.length < 5) {
      await sock.sendMessage(sender, {
        text:
          'Format: .tambah_jadwal [hari] [waktu] "[mata_kuliah]" "[dosen]" "[ruang]"\n' +
          'Contoh: .tambah_jadwal 1 08:00-10:00 "Pemrograman Web" "Pak Budi Santoso" "Lab Komputer 1"\n\n' +
          "Hari yang tersedia:\n" +
          "1 - Senin\n" +
          "2 - Selasa\n" +
          "3 - Rabu\n" +
          "4 - Kamis\n" +
          "5 - Jumat\n" +
          "6 - Sabtu\n" +
          "7 - Minggu\n\n" +
          'Catatan: Gunakan tanda kutip (") untuk nama mata kuliah, dosen, dan ruang yang terdiri dari beberapa kata atau mengandung karakter khusus',
      });
      return;
    }

    // Parse arguments with quotes
    let parsedArgs = [];
    let currentArg = "";
    let inQuotes = false;

    // Gabungkan semua argumen menjadi satu string
    const fullCommand = args.join(" ");

    // Parse string dengan lebih baik
    for (let i = 0; i < fullCommand.length; i++) {
      const char = fullCommand[i];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
        continue;
      }

      if (char === '"' && inQuotes) {
        inQuotes = false;
        if (currentArg) {
          parsedArgs.push(currentArg.trim());
          currentArg = "";
        }
        continue;
      }

      if (char === " " && !inQuotes) {
        if (currentArg) {
          parsedArgs.push(currentArg.trim());
          currentArg = "";
        }
        continue;
      }

      currentArg += char;
    }

    // Tambahkan argumen terakhir jika ada
    if (currentArg) {
      parsedArgs.push(currentArg.trim());
    }

    // Validasi jumlah argumen
    if (parsedArgs.length < 5) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Pastikan semua argumen terisi dengan benar.\nContoh: .tambah_jadwal 1 10:00-11:40 "Pemrograman Web" "Ahmat Wakit, S.Pd, M.Pd." "D306"',
      });
      return;
    }

    const dayNumber = parseInt(parsedArgs[0]);
    const timeRange = parsedArgs[1];
    const subject = parsedArgs[2];
    const lecturer = parsedArgs[3];
    const location = parsedArgs[4];

    // Validasi hari
    if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 7) {
      await sock.sendMessage(sender, {
        text: "❌ Hari tidak valid! Gunakan angka 1-7:\n1 - Senin\n2 - Selasa\n3 - Rabu\n4 - Kamis\n5 - Jumat\n6 - Sabtu\n7 - Minggu",
      });
      return;
    }

    // Konversi angka hari ke nama hari (1 = Senin, 7 = Minggu)
    const dayNames = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];
    const day = dayNames[dayNumber - 1]; // Kurangi 1 karena array dimulai dari 0

    // Validasi format waktu
    const timeRegex = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;
    if (!timeRegex.test(timeRange)) {
      await sock.sendMessage(sender, {
        text: "❌ Format waktu tidak valid! Gunakan format: HH:MM-HH:MM\nContoh: 08:00-10:00",
      });
      return;
    }

    const [startTime, endTime] = timeRange.split("-");

    const collection = db.collection("schedules");
    const scheduleId = scheduleHandler.generateUniqueId();

    // Simpan jadwal tanpa field date yang bisa kadaluarsa
    await collection.insertOne({
      _id: scheduleId,
      subject,
      lecturer,
      day: day,
      startTime,
      endTime,
      location,
      createdAt: new Date(),
      isRecurring: true, // Tandai sebagai jadwal berulang
    });

    await sock.sendMessage(sender, {
      text: `✅ Jadwal berhasil ditambahkan!\n\n*${day}*\n${scheduleHandler.formatScheduleTime(
        {
          subject,
          lecturer,
          startTime,
          endTime,
          location,
        }
      )}`,
    });
  },

  deleteSchedule: async (sock, sender, db, args) => {
    if (args.length < 1) {
      await sock.sendMessage(sender, {
        text: "Format: .hapus_jadwal [id_jadwal]\nContoh: .hapus_jadwal AB\n\nGunakan perintah .jadwal untuk melihat daftar jadwal.",
      });
      // Tampilkan daftar jadwal dengan ID
      await scheduleHandler.viewSchedule(sock, sender, db, true);
      return;
    }

    const scheduleId = args[0].toUpperCase();
    const collection = db.collection("schedules");

    // Cek apakah jadwal ada
    const schedule = await collection.findOne({ _id: scheduleId });
    if (!schedule) {
      await sock.sendMessage(sender, {
        text: "❌ Jadwal tidak ditemukan. Berikut daftar jadwal yang tersedia:",
      });
      // Tampilkan daftar jadwal dengan ID
      await scheduleHandler.viewSchedule(sock, sender, db, true);
      return;
    }

    // Konfirmasi penghapusan
    const confirmMessage =
      `Apakah Anda yakin ingin menghapus jadwal berikut?\n\n` +
      `${schedule.day}\n` +
      `${schedule.startTime}-${schedule.endTime} | ${schedule.subject} | ${schedule.lecturer} | ${schedule.location}\n\n` +
      `Ketik .ya untuk mengkonfirmasi penghapusan.`;

    await sock.sendMessage(sender, { text: confirmMessage });

    // Simpan ID jadwal yang akan dihapus di session
    sock.pendingDelete = scheduleId;
  },

  editSchedule: async (sock, sender, db, args) => {
    if (args.length < 6) {
      await sock.sendMessage(sender, {
        text:
          'Format: .edit_jadwal [id_jadwal] [hari] [waktu] "[mata_kuliah]" "[dosen]" "[ruang]"\n' +
          'Contoh: .edit_jadwal AB 1 10:00-11:40 "Pemrograman Web" "Ahmat Wakit, S.Pd, M.Pd." "D306"\n\n' +
          "Hari yang tersedia:\n" +
          "1 - Senin\n" +
          "2 - Selasa\n" +
          "3 - Rabu\n" +
          "4 - Kamis\n" +
          "5 - Jumat\n" +
          "6 - Sabtu\n" +
          "7 - Minggu\n\n" +
          'Catatan: Gunakan tanda kutip (") untuk nama mata kuliah, dosen, dan ruang yang terdiri dari beberapa kata atau mengandung karakter khusus\n\n' +
          "Berikut daftar jadwal yang tersedia:",
      });
      // Tampilkan daftar jadwal dengan ID
      await scheduleHandler.viewSchedule(sock, sender, db, true);
      return;
    }

    // Parse arguments with quotes
    let parsedArgs = [];
    let currentArg = "";
    let inQuotes = false;

    // Gabungkan semua argumen menjadi satu string
    const fullCommand = args.join(" ");

    // Parse string dengan lebih baik
    for (let i = 0; i < fullCommand.length; i++) {
      const char = fullCommand[i];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
        continue;
      }

      if (char === '"' && inQuotes) {
        inQuotes = false;
        if (currentArg) {
          parsedArgs.push(currentArg.trim());
          currentArg = "";
        }
        continue;
      }

      if (char === " " && !inQuotes) {
        if (currentArg) {
          parsedArgs.push(currentArg.trim());
          currentArg = "";
        }
        continue;
      }

      currentArg += char;
    }

    // Tambahkan argumen terakhir jika ada
    if (currentArg) {
      parsedArgs.push(currentArg.trim());
    }

    // Validasi jumlah argumen
    if (parsedArgs.length < 6) {
      await sock.sendMessage(sender, {
        text: '❌ Format tidak valid! Pastikan semua argumen terisi dengan benar.\nContoh: .edit_jadwal AB 1 10:00-11:40 "Pemrograman Web" "Ahmat Wakit, S.Pd, M.Pd." "D306"',
      });
      return;
    }

    const scheduleId = args[0].toUpperCase();
    const dayNumber = parseInt(parsedArgs[1]);
    const timeRange = parsedArgs[2];
    const subject = parsedArgs[3];
    const lecturer = parsedArgs[4];
    const location = parsedArgs[5];

    // Validasi hari
    if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 7) {
      await sock.sendMessage(sender, {
        text: "❌ Hari tidak valid! Gunakan angka 1-7:\n1 - Senin\n2 - Selasa\n3 - Rabu\n4 - Kamis\n5 - Jumat\n6 - Sabtu\n7 - Minggu",
      });
      return;
    }

    // Konversi angka hari ke nama hari (1 = Senin, 7 = Minggu)
    const dayNames = [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ];
    const day = dayNames[dayNumber - 1]; // Kurangi 1 karena array dimulai dari 0

    // Validasi format waktu
    const timeRegex = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/;
    if (!timeRegex.test(timeRange)) {
      await sock.sendMessage(sender, {
        text: "❌ Format waktu tidak valid! Gunakan format: HH:MM-HH:MM\nContoh: 08:00-10:00",
      });
      return;
    }

    const [startTime, endTime] = timeRange.split("-");

    const collection = db.collection("schedules");

    // Cek apakah jadwal ada
    const existingSchedule = await collection.findOne({ _id: scheduleId });
    if (!existingSchedule) {
      await sock.sendMessage(sender, {
        text: "❌ Jadwal tidak ditemukan. Berikut daftar jadwal yang tersedia:",
      });
      // Tampilkan daftar jadwal dengan ID
      await scheduleHandler.viewSchedule(sock, sender, db, true);
      return;
    }

    // Konfirmasi pengeditan
    const confirmMessage =
      `Apakah Anda yakin ingin mengedit jadwal berikut?\n\n` +
      `*Jadwal Lama:*\n` +
      `${existingSchedule.day}\n` +
      `${existingSchedule.startTime}-${existingSchedule.endTime} | ${existingSchedule.subject} | ${existingSchedule.lecturer} | ${existingSchedule.location}\n\n` +
      `*Jadwal Baru:*\n` +
      `${day}\n` +
      `${startTime}-${endTime} | ${subject} | ${lecturer} | ${location}\n\n` +
      `Ketik .ya untuk mengkonfirmasi pengeditan.`;

    await sock.sendMessage(sender, { text: confirmMessage });

    // Simpan data jadwal baru di session
    sock.pendingEdit = {
      id: scheduleId,
      day,
      startTime,
      endTime,
      subject,
      lecturer,
      location,
    };
  },
};

module.exports = scheduleHandler;
