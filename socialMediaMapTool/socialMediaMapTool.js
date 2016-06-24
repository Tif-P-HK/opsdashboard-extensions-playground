/*
 * Copyright 2016 Esri
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/io-query",
  "dojo/dom-class",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/config",
  "esri/request",
  "esri/opsdashboard/MapToolProxy",
  "esri/Color",
  "esri/symbols/SimpleLineSymbol",
  "esri/symbols/SimpleFillSymbol",
  "esri/symbols/PictureMarkerSymbol",
  "esri/graphic",
  "esri/geometry/Extent",
  "esri/geometry/webMercatorUtils",
  "esri/geometry/Point",
  "esri/geometry/Circle",
  "dojo/text!./SocialMediaMapToolTemplate.html"
], function (declare, lang, ioQuery, domClass, _WidgetBase, _TemplatedMixin, esriConfig, esriRequest, MapToolProxy, Color, SimpleLineSymbol, SimpleFillSymbol, PictureMarkerSymbol, Graphic, Extent, webMercatorUtils, Point, Circle, templateString) {

  return declare("SocialMediaMapTool", [_WidgetBase, _TemplatedMixin, MapToolProxy], {

    templateString: templateString,

    // todo:
    // Fiddle: https://jsfiddle.net/jwes08nt/5
    // zoom to Flickr photo, or at least highlight the graphic

    constructor: function () {

      // Create the push pin graphic
      var iconPath = location.href.replace(/\/[^/]+$/, '/');
      var pushpinSymbol = new PictureMarkerSymbol(iconPath + "imgs/pushpin.png", 15, 30);
      pushpinSymbol.yoffset = 10;
      this.pushPinGraphic = new Graphic(null, pushpinSymbol);

      // Create the buffer graphic
      var outlineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([0, 0, 0, 0.8]), 1);
      var bufferSymbol = new SimpleFillSymbol(SimpleLineSymbol.STYLE_SOLID, outlineSymbol, new Color([58, 146, 209, 0.2]));
      this.bufferGraphic = new Graphic(null, bufferSymbol);

      // Create the social media feeds graphics
      this.flickrSymbol = new PictureMarkerSymbol(iconPath + "imgs/flickrIcon.png", 34, 46);
      this.flickrSymbol.yoffset = 10;
      this.flickrGraphics = [];

      // Create the symbol of the selected social media
      this.selectedFlickrSymbol = new PictureMarkerSymbol(iconPath + "imgs/selectedFlickrIcon.gif", 44, 60);
      this.selectedFlickrSymbol.yoffset = 10;

      // Set up the query for the Flickr photo search request
      // todo: make tags a config
      this.flickrDomain = "api.flickr.com";
      esriConfig.defaults.io.corsEnabledServers.push(this.flickrDomain);

      // todo: add date to query

      // todo: radius and unit should come from config
      // todo: is noJsonCallback needed?
      this.query = {
        method: "flickr.photos.search",
        api_key: "fe64b1e625e18c0cfd70165541dc786f",
        extras: "geo,description,date_taken,geo,url_s",
        tags: "traffic, weather",
        radius: 30,
        radius_units: "km",
        has_geo: 1,
        safe_search: 1,
        format: "json",
        nojsoncallback: 1
      };

      // Variables for showing the search result
      this.photosInfo = [];
      this.currentPhotoIndex = 0;
    },

    hostReady: function () {

      // Update the size of the user experience
      this.setDisplaySize({
        width: Math.min(this.availableDisplaySize.width / 2, 400),
        height: 40
      });

      // Creates the graphics layers (the one created last will be drawn on top)
      this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function (graphicsLayerProxy) {

        // The layer that contains the search area graphic
        this.bufferGraphicsLayerProxy = graphicsLayerProxy;

        this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function (graphicsLayerProxy) {

          // The layer that contains graphic indicating user's clicked location on the map
          this.pushPinGraphicsLayerProxy = graphicsLayerProxy;

          this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function (graphicsLayerProxy) {

            // The layer that contains the graphics showing the media feeds' locations
            this.mediaFeedsGraphicsLayerProxy = graphicsLayerProxy;

            this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function (graphicsLayerProxy) {

              // The layer that contains the graphics showing the selected media's locations
              this.selectedPhotoGraphicsLayerProxy = graphicsLayerProxy;

              // Activate the drawing activity when the graphics layers are ready
              this.activateMapDrawing({geometryType: "point"});
            }));
          }));
        }));
      }));
    },

    availableDisplaySizeChanged: function (availableSize) {
      // Update the size of the user interface based on whether the user is on the search page or the result page

      if (!domClass.contains(this.searchPage, "hide")) {
        // User is on the search page
        this.setDisplaySize({
          width: Math.min(availableSize / 2, 350),
          height: 40
        });
      } else {
        // User is on the result page
        this.setDisplaySize({
          width: Math.min(availableSize.width / 2, 350),
          height: Math.min(availableSize.height / 2, 450)
        });
      }
    },

    mapDrawComplete: function (geometry) {
      // When user finishes drawing, use the resulting geometry to get the social media feeds within the search area

      if (!geometry)
        return;

      // Clear the graphics, graphics layers and search results from the previous search
      this.mediaFeedsGraphicsLayerProxy.clear();
      this.bufferGraphicsLayerProxy.clear();
      this.pushPinGraphicsLayerProxy.clear();
      this.flickrGraphics = [];
      this.photosInfo = [];

      // Immediately show a feedback at the location clicked by the user
      this.showSelectedArea(geometry);

      // Search for the social media feeds within the area
      this.searchForPhotos(geometry);
    },

    showSelectedArea: function (geometry) {
      // Show user's selected location and the search area

      this.pushPinGraphic.setGeometry(geometry);
      this.pushPinGraphicsLayerProxy.addOrUpdateGraphic(this.pushPinGraphic);

      // todo: more conversion needed if unit = mile
      this.bufferGraphic.setGeometry(new Circle(geometry, {"radius": this.query.radius * 1000}));
      this.bufferGraphicsLayerProxy.addOrUpdateGraphic(this.bufferGraphic);

      this.bufferGraphicsLayerProxy.setVisibility(true);
      this.pushPinGraphicsLayerProxy.setVisibility(true);
    },

    searchForPhotos: function (geometry) {
      // Search for Flickr photos within the area

      if (geometry.spatialReference.isWebMercator())
        geometry = webMercatorUtils.webMercatorToGeographic(geometry);

      this.query.lat = geometry.y;
      this.query.lon = geometry.x;

      // Search for photos
      var requestUrl = "https://" + this.flickrDomain + "/services/rest/?" + ioQuery.objectToQuery(this.query);
      esriRequest({
        url: requestUrl
      }).then(function (response) {

        if (!response || !response.photos || !response.photos.photo) {
          console.log("error doing photo search");
          return;
        }

        var photos = response.photos.photo;
        if (photos.length === 0) {
          alert("No photo was found, try another location");
          this.hideFeedbackGraphics();
          return;
        }

        // Show photos
        var photoLocation;
        var photoId = 0;
        photos.forEach(function (photo) {
          if (photo.latitude && photo.latitude && photoId <=3) {

            photoLocation = new Point(photo.longitude, photo.latitude);
            if (this.mapWidgetProxy.spatialReference.isWebMercator())
              photoLocation = webMercatorUtils.geographicToWebMercator(photoLocation);

            this.flickrGraphics.push(new Graphic(photoLocation, this.flickrSymbol));
            this.photosInfo.push({
              id: ++photoId,
              title: photo.title,
              url: photo.url_s,
              description: photo.description._content,
              location: photoLocation
            })
          }
        }.bind(this));

        // Hide the feedback graphics
        this.hideFeedbackGraphics();

        // Show a graphic on the map at each photo's location
        this.mediaFeedsGraphicsLayerProxy.addOrUpdateGraphics(this.flickrGraphics);

        // Show the photos from the search result on the map tool UI
        this.showResultsPage();

      }.bind(this), function (error) {
        console.log("Error: ", error.message);
      });
    },

    showResultsPage: function () {
      // Hide the user input UI and show the result page

      domClass.add(this.searchPage, "hide");
      this.setDisplaySize({
        width: Math.min(this.availableDisplaySize.width / 2, 350),
        height: Math.min(this.availableDisplaySize.height / 2, 450)
      });
      domClass.remove(this.resultsPage, "hide");

      // Show the first photo on the map tool's UI
      this.showPhoto();
    },

    showPhoto: function () {
      // Show the photo on the map toolbar and highlight the photo on the map

      // Show the photo
      this.photoCount.innerHTML = this.photosInfo.length;
      var photo = this.photosInfo[this.currentPhotoIndex];
      this.currentPhotoId.innerHTML = photo.id;
      this.photoTitle.innerHTML = photo.title;
      this.photoUrl.src = photo.url;
      this.photoDescription.innerHTML = photo.description;

      // Pan to the photo
      var photoLocationWM = photo.location;
      if (!photoLocationWM.spatialReference.isWebMercator())
        photoLocationWM = webMercatorUtils.geographicToWebMercator(photoLocationWM);
      this.mapWidgetProxy.panTo(photoLocationWM);

      // Reset the symbol of the graphic which represents the last selected photo (if any)
      if (this.currentPhotoGraphic) {
        this.currentPhotoGraphic.setSymbol(this.flickrSymbol);
        this.mediaFeedsGraphicsLayerProxy.addOrUpdateGraphic(this.currentPhotoGraphic);
      }

      // Highlight the graphic which represents the currently selected photo
      this.currentPhotoGraphic = this.flickrGraphics[this.currentPhotoIndex];
      this.mediaFeedsGraphicsLayerProxy.removeGraphic(this.currentPhotoGraphic);
      this.mediaFeedsGraphicsLayerProxy.addOrUpdateGraphic(this.currentPhotoGraphic);

      this.currentPhotoGraphic.setSymbol(this.selectedFlickrSymbol);
      this.mediaFeedsGraphicsLayerProxy.addOrUpdateGraphic(this.currentPhotoGraphic);
    },

    showPreviousPhoto: function () {
      // Show the previous photo. Reset the index to this.photos.length - 1 if the photo to show is the first one

      this.currentPhotoIndex = this.photosInfo[this.currentPhotoIndex].id === 1 ? (this.photosInfo.length - 1 ) : --this.currentPhotoIndex;
      this.showPhoto();
    },

    showNextPhoto: function () {
      // Show the next photo. Reset the index to 0 if the photo to show is the last one

      this.currentPhotoIndex = this.photosInfo[this.currentPhotoIndex].id === this.photosInfo.length ? 0 : ++this.currentPhotoIndex;
      this.showPhoto();
    },

    hideFeedbackGraphics: function () {
      // Hide the pushpin graphic and the search area graphic

      this.bufferGraphicsLayerProxy.setVisibility(false);
      this.pushPinGraphicsLayerProxy.setVisibility(false);
    },

    deactivateMapTool: function () {
      // Deactivate the map tool when the Done button is clicked

      this.deactivateMapDrawing();

      this.mapWidgetProxy.destroyGraphicsLayerProxy(this.mediaFeedsGraphicsLayerProxy);
      this.mapWidgetProxy.destroyGraphicsLayerProxy(this.bufferGraphicsLayerProxy);
      this.mapWidgetProxy.destroyGraphicsLayerProxy(this.pushPinGraphicsLayerProxy);

      // Call the base function
      this.inherited(arguments, []);
    }
  });
});