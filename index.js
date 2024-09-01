const express = require('express');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent] });
let muteRole = null;

async function getClientId(token) {
  try {
    const response = await axios.get('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${token}`
      }
    });
    return response.data.id;
  } catch (error) {
    console.error('Error al obtener el clientID:', error);
    throw error;
  }
}

function parseTime(timeStr) {
  const timeRegex = /^(\d+)([smhd])$/;
  const match = timeStr.match(timeRegex);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return amount * 1000;
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function loadWarns() {
  try {
    const data = fs.readFileSync('warns.json');
    return JSON.parse(data);
  } catch (error) {
    console.warn('No se pudo cargar la base de datos de advertencias, se creará una nueva.');
    return {};
  }
}

function saveWarns(warns) {
  try {
    fs.writeFileSync('warns.json', JSON.stringify(warns, null, 2));
  } catch (error) {
    console.error('Error al guardar la base de datos de advertencias:', error);
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Advierte a un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a advertir').setRequired(true))
    .addStringOption(option => option.setName('razón').setDescription('Razón de la advertencia')),

  new SlashCommandBuilder()
    .setName('checkwarns')
    .setDescription('Verifica las advertencias de un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a verificar').setRequired(true)),

  new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Elimina una advertencia de un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a deshacer la advertencia').setRequired(true)),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia a un usuario por un tiempo')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a silenciar').setRequired(true))
    .addStringOption(option => option.setName('tiempo').setDescription('Tiempo de silencio (ej: 10s, 1m)').setRequired(true))
    .addStringOption(option => option.setName('razón').setDescription('Razón del silencio')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Desactiva el silencio de un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a deshacer el silencio').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setmuterole')
    .setDescription('Establece el rol de silencio')
    .addRoleOption(option => option.setName('rol').setDescription('El rol de silencio').setRequired(true)),

  new SlashCommandBuilder()
    .setName('baneotemporal')
    .setDescription('Banea temporalmente a un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a banear').setRequired(true))
    .addStringOption(option => option.setName('tiempo').setDescription('Tiempo de baneo (ej: 10s, 1m)').setRequired(true))
    .addStringOption(option => option.setName('razón').setDescription('Razón del baneo')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario')
    .addUserOption(option => option.setName('usuario').setDescription('El usuario a banear').setRequired(true))
    .addStringOption(option => option.setName('razón').setDescription('Razón del baneo')),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario')
    .addUserOption(option => option.setName('usuario_id').setDescription('ID del usuario a desbanear').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes en el canal')
    .addIntegerOption(option => option.setName('cantidad').setDescription('Cantidad de mensajes a borrar (máximo 1000)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Establece el tiempo de retraso en el canal')
    .addStringOption(option => option.setName('tiempo').setDescription('Tiempo de retraso (ej: 10s, 1m, 5h)').setRequired(true)),
];

const warns = loadWarns();

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  try {
    const clientId = await getClientId(process.env.BOT_TOKEN);
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(clientId), { body: commands.map(command => command.toJSON()) });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'warn') {
      await handleWarnCommand(interaction);
    } else if (interaction.commandName === 'checkwarns') {
      await handleCheckWarnsCommand(interaction);
    } else if (interaction.commandName === 'unwarn') {
      await handleUnwarnCommand(interaction);
    } else if (interaction.commandName === 'mute') {
      await handleMuteCommand(interaction);
    } else if (interaction.commandName === 'unmute') {
      await handleUnmuteCommand(interaction);
    } else if (interaction.commandName === 'setmuterole') {
      await handleSetMuteRoleCommand(interaction);
    } else if (interaction.commandName === 'baneotemporal') {
      await handleTempBanCommand(interaction);
    } else if (interaction.commandName === 'ban') {
      await handleBanCommand(interaction);
    } else if (interaction.commandName === 'unban') {
      await handleUnbanCommand(interaction);
    } else if (interaction.commandName === 'clear') {
      await handleClearCommand(interaction);
    } else if (interaction.commandName === 'slowmode') {
      await handleSlowmodeCommand(interaction);
    }
  } catch (error) {
    console.error(`Error al ejecutar el comando ${interaction.commandName}:`, error);
    await interaction.reply({ content: 'Hubo un error al ejecutar este comando!', ephemeral: true });
  }
});

async function handleWarnCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const reason = interaction.options.getString('razón') || 'Sin razón proporcionada';
  const moderator = interaction.user.tag;

  warns[user.id] = warns[user.id] || [];
  warns[user.id].push({ reason, moderator });
  saveWarns(warns);

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('Advertencia')
    .setDescription(`Usuario Advertido: ${user.tag}`)
    .addFields(
      { name: 'Moderador', value: moderator, inline: true },
      { name: 'Razón', value: reason, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleCheckWarnsCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const userWarns = warns[user.id] || [];

  if (userWarns.length === 0) {
    return await interaction.reply(`${user.tag} no tiene advertencias.`);
  }

  const embed = new EmbedBuilder()
    .setColor('#007BFF')
    .setTitle('Historial de Advertencias')
    .setDescription(`Cantidad de avisos: ${userWarns.length}`)
    .setTimestamp();

  userWarns.forEach((warn, index) => {
    embed.addFields(
      { name: `**__Advertencia ${index + 1}__**`, value: `🔷 ${warn.reason} - ${warn.moderator}`, inline: false }
    );
  });

  await interaction.reply({ embeds: [embed] });
}

async function handleUnwarnCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const userWarns = warns[user.id];

  if (!userWarns || userWarns.length === 0) {
    return await interaction.reply('No hay advertencias que eliminar para este usuario.');
  }

  const removedWarning = userWarns.pop();
  if (userWarns.length === 0) {
    delete warns[user.id];
  } else {
    warns[user.id] = userWarns;
  }
  saveWarns(warns);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Advertencia Eliminada')
    .setDescription(`Se ha eliminado la advertencia de ${user.tag}.`)
    .addFields(
      { name: 'Razón', value: removedWarning.reason, inline: true },
      { name: 'Moderador', value: removedWarning.moderator, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleMuteCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const timeStr = interaction.options.getString('tiempo');
  const reason = interaction.options.getString('razón') || 'Sin razón especificada';
  const member = await interaction.guild.members.fetch(user.id);

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return await interaction.reply('No tengo permisos suficientes para silenciar a ese usuario.');
  }

  if (!muteRole) {
    return await interaction.reply('El rol de silencio no está configurado. Usa `/setmuterole` para configurarlo.');
  }

  const muteDuration = parseTime(timeStr);
  if (!muteDuration) {
    return await interaction.reply('Formato de tiempo inválido. Usa "10s", "1m", "1h", etc.');
  }

  await member.roles.add(muteRole, reason);

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('Silenciado')
    .setDescription(`${user.tag} ha sido silenciado por ${timeStr}.`)
    .addFields(
      { name: 'Razón', value: reason, inline: true },
      { name: 'Silenciado por', value: interaction.user.tag, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  setTimeout(async () => {
    try {
      await member.roles.remove(muteRole);
      await interaction.followUp(`${user.tag} ha sido desactivado el silencio automáticamente.`);
    } catch (error) {
      console.error(`Error al desactivar el silencio automáticamente a ${user.tag}:`, error);
    }
  }, muteDuration);
}

async function handleUnmuteCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const member = await interaction.guild.members.fetch(user.id);

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return await interaction.reply('No tengo permisos suficientes para deshacer el silencio de ese usuario.');
  }

  if (!muteRole) {
    return await interaction.reply('El rol de silencio no está configurado. Usa `/setmuterole` para configurarlo.');
  }

  await member.roles.remove(muteRole);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Desactivado Silencio')
    .setDescription(`${user.tag} ha sido desactivado el silencio.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSetMuteRoleCommand(interaction) {
  const role = interaction.options.getRole('rol');

  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return await interaction.reply('No tengo permisos suficientes para establecer el rol de silencio.');
  }

  muteRole = role;
  await interaction.reply(`El rol de silencio ha sido establecido a ${role.name}.`);
}

async function handleTempBanCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const timeStr = interaction.options.getString('tiempo');
  const reason = interaction.options.getString('razón') || 'Sin razón especificada';
  const member = await interaction.guild.members.fetch(user.id);

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply('No puedes banear a un usuario con permisos de administrador.');
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return await interaction.reply('No tengo permisos suficientes como para banear temporalmente a ese usuario.');
  }

  const banDuration = parseTime(timeStr);
  if (!banDuration) {
    return await interaction.reply('Formato de tiempo inválido. Usa "10s", "1m", "1h", etc.');
  }

  await interaction.guild.members.ban(user, { reason });

  const embed = new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle('Baneo Temporal')
    .setDescription(`${user.tag} ha sido baneado temporalmente por ${timeStr}.`)
    .addFields(
      { name: 'Razón', value: reason, inline: true },
      { name: 'Baneado por', value: interaction.user.tag, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  setTimeout(async () => {
    try {
      await interaction.guild.members.unban(user.id);
      await interaction.followUp(`${user.tag} ha sido desbaneado automáticamente tras el tiempo de baneo.`);
    } catch (error) {
      console.error(`Error al desbanear automáticamente a ${user.tag}:`, error);
    }
  }, banDuration);
}

async function handleBanCommand(interaction) {
  const user = interaction.options.getUser('usuario');
  const reason = interaction.options.getString('razón') || 'Sin razón especificada';
  const member = await interaction.guild.members.fetch(user.id);

  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply('No puedes banear a un usuario con permisos de administrador.');
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return await interaction.reply('No tengo permisos suficientes como para banear a ese usuario.');
  }

  await interaction.guild.members.ban(user, { reason });

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('Baneo')
    .setDescription(`Baneado a ${user.tag}.`)
    .addFields(
      { name: 'Razón', value: reason, inline: true },
      { name: 'Baneado por', value: interaction.user.tag, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleUnbanCommand(interaction) {
  const banList = await interaction.guild.bans.fetch();
  const userId = interaction.options.getString('usuario_id');

  const userToUnban = banList.get(userId);
  if (!userToUnban) {
    return await interaction.reply('No se encontró un usuario baneado con ese ID.');
  }

  if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
    return await interaction.reply('No tengo permisos suficientes como para desbanear a ese usuario.');
  }

  await interaction.guild.members.unban(userId);

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('Desbaneo')
    .setDescription(`Desbaneado a ${userToUnban.tag}.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleClearCommand(interaction) {
  const amount = interaction.options.getInteger('cantidad');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply('No tienes permisos para usar este comando.');
  }

  if (amount > 1000) {
    return await interaction.reply('La cantidad de mensajes a borrar debe ser menor o igual a 1000.');
  }

  const messages = await interaction.channel.messages.fetch({ limit: amount });
  await interaction.channel.bulkDelete(messages);

  await interaction.reply({ content: `Se han borrado ${amount} mensajes.`, ephemeral: true }); 
}

async function handleSlowmodeCommand(interaction) {
  const timeStr = interaction.options.getString('tiempo');

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply('No tienes permisos para usar este comando.');
  }

  const slowmodeDuration = parseTime(timeStr);
  if (!slowmodeDuration) {
    return await interaction.reply('Formato de tiempo inválido. Usa "10s", "1m", "5h", etc.');
  }

  await interaction.channel.setRateLimitPerUser(slowmodeDuration / 1000);

  await interaction.reply({ content: `Se ha establecido el slowmode a ${timeStr}.`, ephemeral: true }); 
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bienvenido a la API del Bot!');
});

app.get('/status', (req, res) => {
  res.send('Bot activo');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

client.login(process.env.BOT_TOKEN);
