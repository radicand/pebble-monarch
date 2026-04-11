#include <pebble.h>

static Window *s_main_window;
static TextLayer *s_title_layer;
static TextLayer *s_net_worth_layer;
static TextLayer *s_updated_layer;
static TextLayer *s_status_layer;

static char s_net_worth_buffer[32] = "--";
static char s_updated_buffer[40] = "Updated --:--";
static char s_status_buffer[40] = "Open settings to connect";

static void request_refresh(void) {
  DictionaryIterator *iter;
  AppMessageResult result = app_message_outbox_begin(&iter);

  if (result != APP_MSG_OK || !iter) {
    snprintf(s_status_buffer, sizeof(s_status_buffer), "Send failed (%d)", result);
    text_layer_set_text(s_status_layer, s_status_buffer);
    return;
  }

  dict_write_uint8(iter, MESSAGE_KEY_REQUEST_REFRESH, 1);
  dict_write_end(iter);

  result = app_message_outbox_send();
  if (result != APP_MSG_OK) {
    snprintf(s_status_buffer, sizeof(s_status_buffer), "Retry (%d)", result);
    text_layer_set_text(s_status_layer, s_status_buffer);
  } else {
    snprintf(s_status_buffer, sizeof(s_status_buffer), "Refreshing...");
    text_layer_set_text(s_status_layer, s_status_buffer);
  }
}

static void select_click_handler(ClickRecognizerRef recognizer, void *context) {
  request_refresh();
}

static void click_config_provider(void *context) {
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
}

static void in_received_handler(DictionaryIterator *iter, void *context) {
  Tuple *net_worth_tuple = dict_find(iter, MESSAGE_KEY_NET_WORTH_TEXT);
  Tuple *updated_tuple = dict_find(iter, MESSAGE_KEY_UPDATED_TEXT);
  Tuple *status_tuple = dict_find(iter, MESSAGE_KEY_STATUS_TEXT);
  Tuple *error_tuple = dict_find(iter, MESSAGE_KEY_ERROR_TEXT);

  if (net_worth_tuple && net_worth_tuple->type == TUPLE_CSTRING) {
    snprintf(s_net_worth_buffer, sizeof(s_net_worth_buffer), "%s", net_worth_tuple->value->cstring);
    text_layer_set_text(s_net_worth_layer, s_net_worth_buffer);
  }

  if (updated_tuple && updated_tuple->type == TUPLE_CSTRING) {
    snprintf(s_updated_buffer, sizeof(s_updated_buffer), "%s", updated_tuple->value->cstring);
    text_layer_set_text(s_updated_layer, s_updated_buffer);
  }

  if (status_tuple && status_tuple->type == TUPLE_CSTRING) {
    snprintf(s_status_buffer, sizeof(s_status_buffer), "%s", status_tuple->value->cstring);
    text_layer_set_text(s_status_layer, s_status_buffer);
  }

  if (error_tuple && error_tuple->type == TUPLE_CSTRING) {
    snprintf(s_status_buffer, sizeof(s_status_buffer), "%s", error_tuple->value->cstring);
    text_layer_set_text(s_status_layer, s_status_buffer);
  }
}

static void in_dropped_handler(AppMessageResult reason, void *context) {
  snprintf(s_status_buffer, sizeof(s_status_buffer), "Dropped (%d)", reason);
  text_layer_set_text(s_status_layer, s_status_buffer);
}

static void out_failed_handler(DictionaryIterator *iter, AppMessageResult reason, void *context) {
  snprintf(s_status_buffer, sizeof(s_status_buffer), "NACK (%d)", reason);
  text_layer_set_text(s_status_layer, s_status_buffer);
}

static void out_sent_handler(DictionaryIterator *iter, void *context) {
  (void)iter;
}

static void main_window_load(Window *window) {
  Layer *window_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(window_layer);

  s_title_layer = text_layer_create(GRect(0, 10, bounds.size.w, 28));
  text_layer_set_text(s_title_layer, "Monarch Net Worth");
  text_layer_set_text_alignment(s_title_layer, GTextAlignmentCenter);
  text_layer_set_font(s_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_background_color(s_title_layer, GColorClear);
  text_layer_set_text_color(s_title_layer, PBL_IF_COLOR_ELSE(GColorCyan, GColorWhite));
  layer_add_child(window_layer, text_layer_get_layer(s_title_layer));

  s_net_worth_layer = text_layer_create(GRect(8, 58, bounds.size.w - 16, 90));
  text_layer_set_text(s_net_worth_layer, s_net_worth_buffer);
  text_layer_set_text_alignment(s_net_worth_layer, GTextAlignmentCenter);
  text_layer_set_font(s_net_worth_layer, fonts_get_system_font(FONT_KEY_BITHAM_42_BOLD));
  text_layer_set_overflow_mode(s_net_worth_layer, GTextOverflowModeWordWrap);
  text_layer_set_background_color(s_net_worth_layer, GColorClear);
  text_layer_set_text_color(s_net_worth_layer, GColorWhite);
  layer_add_child(window_layer, text_layer_get_layer(s_net_worth_layer));

  s_updated_layer = text_layer_create(GRect(0, 158, bounds.size.w, 24));
  text_layer_set_text(s_updated_layer, s_updated_buffer);
  text_layer_set_text_alignment(s_updated_layer, GTextAlignmentCenter);
  text_layer_set_font(s_updated_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_background_color(s_updated_layer, GColorClear);
  text_layer_set_text_color(s_updated_layer, PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
  layer_add_child(window_layer, text_layer_get_layer(s_updated_layer));

  s_status_layer = text_layer_create(GRect(6, bounds.size.h - 34, bounds.size.w - 12, 28));
  text_layer_set_text(s_status_layer, s_status_buffer);
  text_layer_set_text_alignment(s_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_status_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_background_color(s_status_layer, GColorClear);
  text_layer_set_text_color(s_status_layer, PBL_IF_COLOR_ELSE(GColorVividCerulean, GColorWhite));
  layer_add_child(window_layer, text_layer_get_layer(s_status_layer));
}

static void main_window_unload(Window *window) {
  text_layer_destroy(s_title_layer);
  text_layer_destroy(s_net_worth_layer);
  text_layer_destroy(s_updated_layer);
  text_layer_destroy(s_status_layer);
}

static void init(void) {
  s_main_window = window_create();
  window_set_background_color(s_main_window, PBL_IF_COLOR_ELSE(GColorOxfordBlue, GColorBlack));
  window_set_window_handlers(s_main_window, (WindowHandlers) {
    .load = main_window_load,
    .unload = main_window_unload,
  });
  window_set_click_config_provider(s_main_window, click_config_provider);

  const uint32_t inbox_size = 512;
  const uint32_t outbox_size = 128;
  app_message_register_inbox_received(in_received_handler);
  app_message_register_inbox_dropped(in_dropped_handler);
  app_message_register_outbox_failed(out_failed_handler);
  app_message_register_outbox_sent(out_sent_handler);
  app_message_open(inbox_size, outbox_size);

  window_stack_push(s_main_window, true);
}

static void deinit(void) {
  window_destroy(s_main_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
