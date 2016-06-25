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
  "dijit/_WidgetBase",
  "dijit/_TemplatedMixin",
  "esri/opsdashboard/MapToolConfigurationProxy",
  "dojo/text!./socialMediaMapToolConfigTemplate.html",
  "dijit/form/TextBox",
  "dijit/form/NumberTextBox",
  "dijit/form/Select",
  "dojo/number"
], function (declare, lang, _WidgetBase, _TemplatedMixin, MapToolConfigurationProxy, templateString, TextBox, NumberTextBox, Select, number) {

  return declare("SocialMediaMapToolConfig", [_WidgetBase, _TemplatedMixin, MapToolConfigurationProxy], {
    templateString: templateString,

    // Provide a configuration UI to capture the following
    // -date

    postCreate: function () {
      this.inherited(arguments);
    },

    tagsFieldChanged: function(){
      if(this.tagsField.value === "")
        this.readyToPersistConfig(false);
      else
        this.readyToPersistConfig(true);
    },

    radiusInputChanged: function () {
      var radius = number.parse(this.radiusField.value);
      var radiusUnit = this.radiusUnitField.value;

      if (radius && radius > 0 && ((radiusUnit == "km" && radius < 32) || (radiusUnit == "mi" && radius < 20 ))) {
        this.config.radius = {
          "value": radius,
          "unit": radiusUnit
        };
        console.log("radius " + this.config.radius.value + " " + this.config.unit);
        this.readyToPersistConfig(true);
      }
      else
        this.readyToPersistConfig(false);
    },

    dateFieldChanged: function(){
      var date = number.parse(this.dateField.value)
      if(!date || date <= 0)
        this.readyToPersistConfig(false);
      else
        this.readyToPersistConfig(true);
    }
  });
});