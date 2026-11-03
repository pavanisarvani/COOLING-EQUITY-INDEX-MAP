// ==================================================
// COOLING EQUITY INDEX - BEGINNER MINI PROJECT
// STUDY AREA: VISAKHAPATNAM
// PERIOD: MARCH TO MAY 2024
// ==================================================


// STEP 1: LOAD STUDY AREA

var studyArea = ee.FeatureCollection(
  'projects/project1-504812/assets/vizag_boundary'
);

var roi = studyArea.geometry();

Map.centerObject(studyArea, 10);

Map.addLayer(studyArea, {color: 'white'}, 'Study Area');


// STEP 2: SET THE STUDY DATES

var startDate = '2024-03-01';
var endDate = '2024-06-01';


// STEP 3: LOAD LANDSAT IMAGES

var landsat8 = ee.ImageCollection(
  'LANDSAT/LC08/C02/T1_L2'
);

var landsat9 = ee.ImageCollection(
  'LANDSAT/LC09/C02/T1_L2'
);

// Combine Landsat 8 and Landsat 9.

var landsat = landsat8
  .merge(landsat9)
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.eq('PROCESSING_LEVEL', 'L2SP'));

print('Number of Landsat images:', landsat.size());


// STEP 4: REMOVE CLOUDS AND PREPARE IMAGES

function removeClouds(image) {

  var qa = image.select('QA_PIXEL');

  // Remove cloudy and shadow pixels.
  var cloudMask = qa.bitwiseAnd(63).eq(0);

  // Convert satellite bands into reflectance.
  var optical = image.select([
    'SR_B4',
    'SR_B5',
    'SR_B6'
  ])
  .multiply(0.0000275)
  .add(-0.2);

  // Convert temperature into Celsius.
  var temperature = image.select('ST_B10')
    .multiply(0.00341802)
    .add(149)
    .subtract(273.15)
    .rename('LST');

  // Combine the bands.
  return optical
    .addBands(temperature)
    .updateMask(cloudMask)
    .updateMask(image.select('QA_RADSAT').eq(0));
}

// Apply cloud removal.
var cleanImages = landsat.map(removeClouds);


// STEP 5: CREATE ONE IMAGE

var image = cleanImages
  .median()
  .clip(roi);

Map.addLayer(
  image,
  {
    bands: ['SR_B4', 'SR_B4', 'SR_B4'],
    min: 0,
    max: 0.3
  },
  'Satellite Image',
  false
);


// STEP 6: CALCULATE LAND SURFACE TEMPERATURE

var LST = image.select('LST');

Map.addLayer(
  LST,
  {
    min: 20,
    max: 45,
    palette: ['blue', 'yellow', 'orange', 'red']
  },
  'Land Surface Temperature',
  false
);


// STEP 7: CALCULATE NDVI

var NDVI = image.expression(
  '(NIR - RED) / (NIR + RED)',
  {
    NIR: image.select('SR_B5'),
    RED: image.select('SR_B4')
  }
).rename('NDVI');

Map.addLayer(
  NDVI,
  {
    min: 0,
    max: 0.8,
    palette: ['brown', 'yellow', 'green']
  },
  'Vegetation NDVI',
  false
);


// STEP 8: CALCULATE NDBI

var NDBI = image.expression(
  '(SWIR - NIR) / (SWIR + NIR)',
  {
    SWIR: image.select('SR_B6'),
    NIR: image.select('SR_B5')
  }
).rename('NDBI');

Map.addLayer(
  NDBI,
  {
    min: -0.2,
    max: 0.4,
    palette: ['green', 'yellow', 'red']
  },
  'Built-up NDBI',
  false
);


// STEP 9: NORMALIZE NDVI WITH FIXED BOUNDS

var vegetation = NDVI
  .subtract(-0.2)
  .divide(1.0)
  .clamp(0, 1);


// STEP 10: NORMALIZE TEMPERATURE WITH FIXED BOUNDS

var temperatureScore = LST
  .subtract(22)
  .divide(26) // Ranges from 22°C to 48°C
  .clamp(0, 1);


// STEP 11: NORMALIZE BUILT-UP AREAS WITH FIXED BOUNDS

var builtUp = NDBI
  .subtract(-0.2)
  .divide(0.6)
  .clamp(0, 1);


// STEP 12: IDENTIFY WATER

var waterImage = ee.Image(
  'JRC/GSW1_4/GlobalSurfaceWater'
).select('occurrence');

var water = waterImage.gte(30)
  .unmask(0)
  .clip(roi);


// STEP 13: CALCULATE DISTANCE FROM WATER

var waterArea = roi.buffer(3100);

var waterData = waterImage
  .gte(30)
  .clip(waterArea)
  .unmask(0);

var distance = waterData.distance(
  ee.Kernel.euclidean(3000, 'meters')
);

distance = distance.unmask(3000);

var waterCooling = ee.Image.constant(1)
  .subtract(distance.divide(3000))
  .clamp(0, 1)
  .clip(roi);


// STEP 14: CALCULATE COOLING SCORE

var coolingScore = vegetation
  .multiply(0.60)
  .add(waterCooling.multiply(0.40));


// =============================================================
// STEP 15 & 16: CORRECTED HEATING SCORE AND FINAL CEI
// =============================================================

// Temperature = 60%
// Built-up areas = 40% (Balanced weights avoiding local distortion)

var heatingScore = temperatureScore
  .multiply(0.60)
  .add(builtUp.multiply(0.40));

// CEI = Cooling Score - Heating Score

var CEI = coolingScore
  .subtract(heatingScore)
  .rename('CEI');

Map.addLayer(
  CEI,
  {
    min: -1,
    max: 1,
    palette: ['red', 'white', 'blue']
  },
  'Continuous CEI',
  false
);


// STEP 17: CREATE THREE CLASSES

var CEI_Class = ee.Image.constant(2)
  .where(CEI.gt(0.15), 1)
  .where(CEI.lt(-0.15), 3)
  .updateMask(CEI.mask())
  .clip(roi);


// STEP 18: DISPLAY FINAL MAP

Map.addLayer(
  CEI_Class,
  {
    min: 1,
    max: 3,
    palette: [
      '1677D2',
      '24A148',
      'E53935'
    ]
  },
  'FINAL COOLING EQUITY MAP'
);


// STEP 19: CREATE LEGEND

var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '10px',
    backgroundColor: 'white'
  }
});

legend.add(ui.Label({
  value: 'COOLING EQUITY INDEX',
  style: {fontWeight: 'bold', fontSize: '15px'}
}));

function legendRow(color, name) {

  var box = ui.Label('', {
    backgroundColor: color,
    padding: '8px',
    margin: '0 8px 5px 0'
  });

  var label = ui.Label(name);

  legend.add(ui.Panel([
    box,
    label
  ], ui.Panel.Layout.Flow('horizontal')));
}

legendRow('#1677D2', 'Surplus Cooling');
legendRow('#24A148', 'Balanced Cooling');
legendRow('#E53935', 'Heating Dominant');

Map.add(legend);


// STEP 20: PRINT RESULTS

var averageCEI = CEI.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: roi,
  scale: 30,
  maxPixels: 1e13
});

print('Average CEI:', averageCEI);

var averageLST = LST.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: roi,
  scale: 30,
  maxPixels: 1e13
});

print('Average Land Surface Temperature:', averageLST);
// ==================================================
// STEP 21: EXPORT FINAL CEI CLASSIFIED MAP
// ==================================================

Export.image.toDrive({
  image: CEI_Class.toInt8(),

  description: 'Vizag_CEI_Classified_Map_2024',

  folder: 'CEI_Project',

  fileNamePrefix: 'Vizag_CEI_Classified_Map_2024',

  region: roi,

  scale: 30,

  crs: 'EPSG:32644',

  maxPixels: 1e13,

  fileFormat: 'GeoTIFF'
});
