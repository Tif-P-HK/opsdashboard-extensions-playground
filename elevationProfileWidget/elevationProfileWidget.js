define([
  "dojo/_base/declare",
  "dojo/_base/lang",
  "dojo/dom-class",
  "dojo/Deferred",
  "esri/tasks/Geoprocessor",
  "esri/graphic",
  "esri/geometry/webMercatorUtils",
  "esri/geometry/geodesicUtils",
  "esri/units",
  "esri/tasks/FeatureSet",
  "esri/Color",
  "esri/symbols/SimpleLineSymbol",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/geometry/Point",
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/opsdashboard/WidgetProxy",
  "dojo/text!./elevationProfileWidgetTemplate.html"
], function(
  declare,
  lang,
  domClass,
  Deferred,
  Geoprocessor,
  Graphic,
  webMercatorUtils,
  geodesicUtils,
  Units,
  FeatureSet,
  Color,
  SimpleLineSymbol,
  SimpleMarkerSymbol,
  Point,
  _WidgetBase,
  _TemplatedMixin,
  WidgetProxy,
  templateString){
  return declare("elevationProfileWidget", [_WidgetBase, _TemplatedMixin, WidgetProxy], {

    templateString: templateString,

    constructor: function(){
      this.unit = "meters";
    },

    postCreate: function(){
      this.inherited(arguments);

      // Set up the dimension of the chart to be used to display the profile graph
      this.height = window.innerHeight * 0.85;
      this.width = window.innerWidth;
      this.margins = {
        top: 20,
        right: 20,
        bottom: 20,
        left: 60
      };

      // Set up the x and y range to fit the profile graph UI into the widget's window
      this.calculateRanges();

      // Create the input line graphic to be shown on the map
      var outlineSymbol = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#192a64"), 3);
      this.inputLineGraphic = new Graphic(null, outlineSymbol);

      // Create a location graphic to indicate the map location when user hovers on the profile graph
      var chartLocationSymbol = new SimpleMarkerSymbol(
        SimpleMarkerSymbol.STYLE_X,
        15,
        new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color("#000000"), 1),
        new Color("#000000"));
      this.chartLocationGraphic = new Graphic(null, chartLocationSymbol);

      // update the dimensions of the SVG when the dimension of the widget changes
      window.onresize = lang.hitch(this, function(){
        this.height = window.innerHeight * 0.85;
        this.width = window.innerWidth;

        // recalculate the x and y ranges using the new dimensions
        this.calculateRanges();
      });
    },

    calculateRanges: function(){
      // Set up the range to fit the profile graph into the widget's window
      this.xRange = d3.scale.linear()
        .range([this.margins.left, this.width - this.margins.right]);

      this.yRange = d3.scale.linear()
        .range([this.height - this.margins.top, this.margins.bottom]);
    },

    hostReady: function(){
      // Set up the elevation profile geoprocessing service
      // when the host (Operations Dashboard) is ready

      // Retrieve the async elevation service specified for the organization
      // Note: The elevationProfileFeatureAction.json manifest file must have
      // the "usePortalServices" set to true in order for the elevation  service
      // (and any other helper services) to be retrieved
      if(!this.portalHelperServices || !this.portalHelperServices.elevationSync){
        console.log("Cannot get the elevation service.");
        return;
      }

      var profileServiceUrl = this.portalHelperServices.elevationSync.url + "/Profile";

      // Set up the Geoprocessing service for calculating the elevation profile
      this.profileService = new Geoprocessor(profileServiceUrl);
      this.profileService.outSpatialReference = this.mapWidgetProxy.spatialReference;

      // Create a graphics layer for the input line graphic
      return this.mapWidgetProxy.createGraphicsLayerProxy().then(lang.hitch(this, function(graphicsLayerProxy){

        // Make a reference to graphicsLayerProxy, then add the input line graphic and the marker graphic
        this.graphicsLayerProxy = graphicsLayerProxy;
        this.graphicsLayerProxy.addOrUpdateGraphics([this.inputLineGraphic, this.chartLocationGraphic]);
      }));
    },

    hostInitializationError: function (err) {
      // Called when the widget could not establish contact with Operations Dashboard
      console.log(err);
    },

    drawLine: function(){
      // Called when the "Draw Line" button is clicked
      // Activate the drawing toolbar when the Draw Line button is clicked
      // Show the loading icon until the profile graph calculation is done (or error-out)

      var toolbarOptions = {
        geometryTypes: ["polyline"],
        autoDeactivate: true
      };
      this.activateDrawingToolbar({geometryTypes: ["polyline"]}).then(lang.hitch(this, function(result){
        if(!result)
          console.log("Error activating drawing toolbar");
        else
          this.showWaitingPage();
      }), lang.hitch(this, function(err){
        console.log("Error activating drawing toolbar " + err);
      }));
    },

    cancelSketch: function(){
      // User clicks the Cancel button, reset the widget to the startup state

      this.deactivateDrawingToolbar(this.mapWidgetProxy);
      this.showStartupPage();
    },

    toolbarDrawComplete: function(inputLine){
      // Capture the geometry of the input line,
      // then use it to calculate the elevation profile

      // Clear the previous geometry of the input line
      this.clearMapGraphics();

      this.showCalculatingPage();

      // Calculate the elevation profile
      this.generateProfileGraph(inputLine).then(lang.hitch(this, function(elevationInfos){

        // Hide the loading icon and show the profile graph
        this.showResultPage();

        if(!elevationInfos || !elevationInfos.elevations || !elevationInfos.locations){
          console.log("Unable to get the elevation info");
          return;
        }

        // Set the input line's geometry, then update its host graphics layer
        this.inputLineGraphic.setGeometry(inputLine);
        this.graphicsLayerProxy.addOrUpdateGraphic(this.inputLineGraphic);

        // Show the elevation info on a profile graph
        this.showProfileGraph(elevationInfos);
      }), lang.hitch(this, function(err){
        // Error occurred when calculating the elevation profile
        // Reset the widget to the startup state

        alert(err);
        this.showStartupPage();
      }));

      // TODO: investigate why the autoDeactivate property isn't working
      this.deactivateDrawingToolbar(this.mapWidgetProxy);
    },

    // TODO: investigate: after calling this the toolbar won't come up again
    drawingToolbarDeactivated: function(){
      // User has canceled the drawing activity, reset the widget
      this.showStartupPage();
    },

    generateProfileGraph: function (inputLine) {
      // Calculate the elevation profile for the input line

      var deferred = new Deferred();

      //Convert web mercator polyline to geographic, then get the sampling distance
      //Assume geographic if not in web mercator
      var geoPolyline = (inputLine.spatialReference.isWebMercator()) ?
        webMercatorUtils.webMercatorToGeographic(inputLine) : inputLine;
      var profileLengthMeters = geodesicUtils.geodesicLengths([geoPolyline], Units.METERS)[0];
      var samplingDistance = (profileLengthMeters / 198);

      // Create input feature set for GP Task
      var inputLineFeatures = new FeatureSet();
      inputLineFeatures.fields = [{
        "name": "OID",
        "type": "esriFieldTypeObjectID",
        "alias": "OID"
      }];

      var inputProfileGraphic = new Graphic(inputLine, null, {OID: 1});
      inputLineFeatures.features = [inputProfileGraphic];

      this.profileService.execute({
        "InputLineFeatures": inputLineFeatures,
        "ProfileIDField": "OID",
        "DEMResolution": "FINEST",
        "MaximumSampleDistance": samplingDistance,
        "MaximumSampleDistanceUnits": this.unit,
        "returnZ": true,
        "returnM": true
      }).then(lang.hitch(this, function (results) {

        if (results.length > 0) {
          var outputProfileLayer = results[0].value;
          if (outputProfileLayer.features.length > 0) {

            var profile = outputProfileLayer.features[0].geometry;

            if (profile.paths.length > 0) {
              var profilePath = profile.paths[0];

              var elevations = [];
              var locations = [];
              profilePath.forEach(lang.hitch(this, function(profilePoint){
                var elevationInfo = {
                  m: profilePoint[3],
                  z: profilePoint[2]
                };
                var locationInfo = {
                  x: profilePoint[0],
                  y: profilePoint[1]
                };
                elevations.push(elevationInfo);
                locations.push(locationInfo);
              }));

              deferred.resolve({
                locations: locations,
                elevations: elevations
              });
            } else {
              deferred.reject(new Error("unable to get elevation information"));
            }
          } else {
            deferred.reject(new Error("unable to get elevation information"));
          }
        } else {
          deferred.reject(new Error("unable to get elevation information"));
        }
      }), deferred.reject);

      return deferred.promise;
    },

    showProfileGraph: function(elevationInfos){
      var elevations = elevationInfos.elevations;
      var locations = elevationInfos.locations;

      // Use a d3 line chart to show the elevation data

      // set the preserveAspectRatio to none so that the SVG will scale
      // to fit entirely into the viewBox
      this.profileGraph = d3.select("#profileGraph")
        .attr("viewBox", "0 0 " + this.width + " " + this.height)
        .attr("preserveAspectRatio", "none");

      //TODO: fix label size
      // http://eyeseast.github.io/visible-data/2013/08/28/responsive-charts-with-d3/

      // Map the x and y domains into their respective ranges
      this.xRange.domain([
        d3.min(elevations, function(d){return d.m}),
        d3.max(elevations, function(d){return d.m})
      ]);

      this.yRange.domain([
        d3.min(elevations, function(d){return d.z}),
        d3.max(elevations, function(d){return d.z})
      ]);

      // Render the x-axis
      var xAxis = d3.svg.axis()
        .scale(this.xRange)
        .tickSize(1)
        .tickFormat(d3.format(",.0f"));

      this.profileGraph.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0, " + (this.height - this.margins.bottom) + ")")
        .call(xAxis);

      // Render the y-axis
      var yAxis = d3.svg.axis()
        .scale(this.yRange)
        .tickSize(1)
        .orient("left")
        .tickFormat(d3.format(",.0f"));

      this.profileGraph.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + (this.margins.left) + ", 0)")
        .call(yAxis);

      // Define the line function
      var lineFunction = d3.svg.line()
        .x(lang.hitch(this, function(d){return this.xRange(d.m);}))
        .y(lang.hitch(this, function(d){return this.yRange(d.z);}))
        .interpolate("linear");

      // Render the line
      this.profileGraph.append("path")
        .attr("class", "chart path")
        .attr("d", lineFunction(elevations));

      // Add title to the x axis
      this.profileGraph.append("text")
        .attr("class", "title")
        .attr("text-anchor", "middle")
        .attr("x", this.width/2)
        .attr("y", this.height - 10)
        .text("Distance in " + this.unit);

      // Add title to the y axis
      this.profileGraph.append("text")
        .attr("class", "title")
        .attr("text-anchor", "middle")
        .attr("transform", "translate("+ (this.margins.top/2) +","+(this.height/2)+ "rotate(-90)")
        .text("Elevation in " + this.unit);

      // TODO: Add titles to the axes
      // http://www.d3noob.org/2014/07/my-favourite-tooltip-method-for-line.html

      // When hovering on the graph, show the z value based on the closest x-value
      var focus = this.profileGraph.append("g")
        .attr("class", "focus")
        .style("display", "none");

      focus.append("circle")
        .attr("r", 4.5);

      focus.append("text")
        .attr("x", 8)
        .attr("dy", -8);

      // Create a vertical line to be shown on the x-axis of the graph when the mouse moves
      // Start by keeping the line off screen (i.e. set x1, x2 to -1)
      this.profileGraph.append("line")
        .attr("class", "yLine")
        .attr("x1", -1)
        .attr("x2", -1)
        .attr("y1", this.margins.bottom)
        .attr("y2", this.height);

      this.bisectM = d3.bisector(function(d) { return d.m; }).left;

      this.profileGraph.append("rect")
        .attr("class", "overlay")
        .attr("width", this.width)
        .attr("height", this.height)
        .on("mouseover", function() { focus.style("display", null); })
        .on("mouseout", function() { focus.style("display", "none");})
        .on("mousemove", lang.hitch(this, function(){
          // Show a circle on the graph
          var m0 = this.xRange.invert(d3.mouse(this.domNode)[0]),
            i = this.bisectM(elevations, m0, 1),
            dElevations0 = elevations[i - 1],
            dElevations1 = elevations[i],
            dElevations = m0 - dElevations0.m > dElevations1.m - m0 ? dElevations1 : dElevations0;
          focus.attr("transform", "translate(" + this.xRange(dElevations.m) + "," + this.yRange(dElevations.z) + ")");
          focus.select("text").text(this.formatValue(dElevations.z));

          // Update the marker graphic's location
          var m = this.xRange.invert(d3.mouse(this.domNode)[0]);
          var i = this.bisectM(elevations, m, 1);
          var location = locations[i];
          this.chartLocationGraphic.setGeometry(new Point(location.x, location.y, this.mapWidgetProxy.spatialReference));
          this.graphicsLayerProxy.addOrUpdateGraphic(this.chartLocationGraphic);

          // Slide the vertical line along the x axis as the mouse moves:
          // Calculate the x-value (this.xRange(m)) of the line.
          // If x < this.margins.left (i.e. on the left side of the y-axis),
          // move the line offscreen (-1); Otherwise, slide the line as the mouse move
          var x = this.xRange(m) < this.margins.left? -1 : this.xRange(m);
          this.profileGraph.select(".yLine")
            .attr("x1", x)
            .attr("x2", x);
        }));

    },

    formatValue: function(d) {
      var formatValue = d3.format(",.0f");
      return formatValue(d) + " " + this.unit;
    },

    clearProfileGraph: function(){
      // Called when the "Clear Profile Graph" button is clicked
      // The profile graph and the input line will be cleared,
      // and the widget will be reset to the start up state

      this.profileGraph.selectAll("g").remove();
      this.profileGraph.selectAll("path").remove();

      this.clearMapGraphics();

      this.showStartupPage();
    },

    clearMapGraphics: function(){
      // Clear the input line graphic and the marker graphic from the map by setting its geometry to null
      // Then update their host graphics layer

      this.inputLineGraphic.geometry = null;
      this.chartLocationGraphic.geometry = null;
      this.graphicsLayerProxy.addOrUpdateGraphics([this.inputLineGraphic, this.chartLocationGraphic]);
    },

    showStartupPage: function(){
      // Show the widget start up page with a button to let user
      // activate the drawing toolbar

      domClass.remove(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showWaitingPage: function(){
      // The page to show when user is drawing a line on the map

      domClass.add(this.drawLineMsg, "hide");
      domClass.remove(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showCalculatingPage: function(){
      // Show the loading page while the result is being calculated

      domClass.add(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.remove(this.calculatingMsg, "hide");
      domClass.add(this.showGraphMsg, "hide");
    },

    showResultPage: function(){
      // Show the result page that displays the elevation profile

      domClass.add(this.drawLineMsg, "hide");
      domClass.add(this.waitingMsg, "hide");
      domClass.add(this.calculatingMsg, "hide");
      domClass.remove(this.showGraphMsg, "hide");
    }
  });
});