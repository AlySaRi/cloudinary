import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import { v2 as cloudinary } from 'cloudinary';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import upload from './config/multer.js';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar LowDB
const adapter = new JSONFile('db.json');
const db = new Low(adapter, { places: [] });
await db.read();

// Configurar Handlebars
app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

// Middlewares
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Ruta principal - mostrar lista de lugares
app.get('/', async (req, res) => {
  await db.read();
  res.render('home', {
    places: db.data.places
  });
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});

//ruta POST para procesar y subir la imagen
app.post('/places', upload.single('image'), async (req, res) => {
  try {
    await db.read();

    const { title } = req.body;

    // Convertir el buffer a base64
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    // Subir a Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'places',
      resource_type: 'auto'
    });

    // Crear objeto del lugar
    const newPlace = {
      id: crypto.randomUUID(),
      title,
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
      createdAt: new Date().toISOString()
    };

    // Añadir a la base de datos
    db.data.places.push(newPlace);
    await db.write();

    res.redirect('/');

  } catch (error) {
    console.error('Error al crear lugar:', error);
    res.status(500).send('Error al subir la imagen');
  }
});


//Ruta GET para mostrar el formulario de edición
app.get('/places/:id/edit', async (req, res) => {
  try {
    await db.read();

    const place = db.data.places.find(p => p.id === req.params.id);

    if (!place) {
      return res.status(404).send('Lugar no encontrado');
    }

    res.render('edit', { place });

  } catch (error) {
    console.error('Error al cargar formulario:', error);
    res.status(500).send('Error al cargar el lugar');
  }
});

//Ruta POST para procesar la actualización
app.post('/places/:id/edit', upload.single('image'), async (req, res) => {
  try {
    await db.read();

    const { title } = req.body;
    const placeIndex = db.data.places.findIndex(p => p.id === req.params.id);

    if (placeIndex === -1) {
      return res.status(404).send('Lugar no encontrado');
    }

    const place = db.data.places[placeIndex];

    // Si hay una nueva imagen
    if (req.file) {
      // 1. Eliminar la imagen anterior de Cloudinary
      if (place.imagePublicId) {
        await cloudinary.uploader.destroy(place.imagePublicId);
      }

      // 2. Subir la nueva imagen
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'places',
        resource_type: 'auto'
      });

      // 3. Actualizar los datos de la imagen
      place.imageUrl = result.secure_url;
      place.imagePublicId = result.public_id;
    }

    // Actualizar el título
    place.title = title;
    place.updatedAt = new Date().toISOString();

    // Guardar cambios
    db.data.places[placeIndex] = place;
    await db.write();

    res.redirect('/');

  } catch (error) {
    console.error('Error al actualizar lugar:', error);
    res.status(500).send('Error al actualizar el lugar');
  }
});

//Ruta para borrar la imagen o place entero
app.post('/places/:id/delete', async (req, res) => {
  try {
    await db.read();

    const placeId = req.params.id;
    const placeIndex = db.data.places.findIndex(p => p.id === placeId);

    if (placeIndex === -1) {
      return res.status(404).send('Lugar no encontrado');
    }

    const place = db.data.places[placeIndex];

    // Si el lugar tiene una imagen, vamos a eliminarla de Cloudinary
    if (place.imagePublicId) {
      await cloudinary.uploader.destroy(place.imagePublicId);
    }

    // Eliminar el lugar de la base de datos
    db.data.places.splice(placeIndex, 1);
    await db.write();

    res.redirect('/');

  } catch (error) {
    console.error('Error al eliminar lugar:', error);
    res.status(500).send('Error al eliminar el lugar')
  }
});