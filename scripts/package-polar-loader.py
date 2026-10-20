from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]/'dist'
with ZipFile(root/'rfl-polar-cloud-loader.zip','w',ZIP_DEFLATED) as z:
    for name in ['polar-clouds.js','polar-flow.js','polar-cloud-format.html']:
        z.write(root/name,name)
    z.writestr('README.txt','RFL polar cloud loader v1\n\nKeep polar-clouds.js and polar-flow.js together. Open polar-cloud-format.html for the encoding and RFL shader integration example.\nGenerate a JSON pack in Planetary Climate Workbench > Polar storms > Cloud layers for RFL.\nThe loader must be connected to the gas renderer; the JSON is not automatically imported by existing RFL releases.\n')
